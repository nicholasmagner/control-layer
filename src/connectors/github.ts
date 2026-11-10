import type { GithubInventory, GithubRepo } from '@/checks/github';
import { CollectResult, section } from './common';
import type { GithubConnection } from './config';

/**
 * Read-only GitHub organization collector (REST API). Works with a token from
 * `gh auth login` or a personal access token. Organization settings and
 * member 2FA status are only visible to organization owners; anything the
 * token can't read is reported as "not evaluated".
 */

const API = 'https://api.github.com';
const MAX_REPOS = 300;

type Json = Record<string, unknown>;

export class GithubError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
  }
}

export function githubClient(token: string) {
  async function request(path: string): Promise<{ status: number; data: unknown; next: string | null }> {
    const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ControlLayer',
      },
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    const next = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
    return { status: res.status, data, next };
  }

  async function get<T = Json>(path: string): Promise<T> {
    const r = await request(path);
    if (r.status >= 400) throw new GithubError(r.status, `${(r.data as Json | null)?.message ?? `HTTP ${r.status}`} (${path.split('?')[0]})`);
    return r.data as T;
  }

  async function list<T = Json>(path: string, max = 5000): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = `${path}${path.includes('?') ? '&' : '?'}per_page=100`;
    while (url && out.length < max) {
      const r = await request(url);
      if (r.status >= 400) throw new GithubError(r.status, `${(r.data as Json | null)?.message ?? `HTTP ${r.status}`} (${path.split('?')[0]})`);
      out.push(...(r.data as T[]));
      url = r.next;
    }
    return out.slice(0, max);
  }

  return { request, get, list };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const n = i++;
      out[n] = await fn(items[n]);
    }
  }));
  return out;
}

export async function collectGithub(conn: GithubConnection, token: string): Promise<CollectResult<GithubInventory>> {
  const gh = githubClient(token);
  const org = conn.org;
  const errors: string[] = [];
  const inventory: GithubInventory = { org, collectedAt: new Date().toISOString() };
  const enc = encodeURIComponent;

  const orgInfo = await gh.get<Json>(`/orgs/${enc(org)}`);
  // Only owners see these fields.
  if (typeof orgInfo.two_factor_requirement_enabled === 'boolean') inventory.twoFactorRequired = orgInfo.two_factor_requirement_enabled;
  else errors.push('Organization settings: only organization owners can read the 2FA requirement and base permission.');
  if (typeof orgInfo.default_repository_permission === 'string') inventory.defaultRepoPermission = orgInfo.default_repository_permission;

  inventory.members = await section('Members', errors, async () => {
    const all = await gh.list<{ login: string }>(`/orgs/${enc(org)}/members`);
    const admins = new Set((await gh.list<{ login: string }>(`/orgs/${enc(org)}/members?role=admin`)).map(m => m.login));
    let without: Set<string> | null = null;
    if (inventory.twoFactorRequired) {
      without = new Set(); // GitHub removes members without 2FA when it is required.
    } else {
      try {
        without = new Set((await gh.list<{ login: string }>(`/orgs/${enc(org)}/members?filter=2fa_disabled`)).map(m => m.login));
      } catch (err) {
        errors.push(`Member 2FA status: ${(err as Error).message}. Only organization owners can see it.`);
      }
    }
    return all.map(m => ({ login: m.login, role: admins.has(m.login) ? 'admin' as const : 'member' as const, twoFactorEnabled: without ? !without.has(m.login) : undefined }));
  });

  inventory.repos = await section('Repositories', errors, async () => {
    const repos = (await gh.list<Json>(`/orgs/${enc(org)}/repos?type=all`, MAX_REPOS * 2)).filter(r => !r.archived).slice(0, MAX_REPOS);
    let unreadable = 0;
    const out = await mapLimit(repos, 8, async (r): Promise<GithubRepo> => {
      const full = `${enc(org)}/${enc(String(r.name))}`;
      const branch = String(r.default_branch ?? 'main');
      const isAdmin = !!(r.permissions as Json | undefined)?.admin;
      const repo: GithubRepo = { name: String(r.name), private: !!r.private, defaultBranch: branch };

      // Review requirement: rulesets (readable with read access), then classic branch protection.
      const rules = await gh.request(`/repos/${full}/rules/branches/${enc(branch)}`);
      const pr = Array.isArray(rules.data)
        ? (rules.data as { type: string; parameters?: { required_approving_review_count?: number } }[]).filter(x => x.type === 'pull_request')
        : [];
      const fromRules = pr.length ? Math.max(...pr.map(x => x.parameters?.required_approving_review_count ?? 0)) : 0;
      if (fromRules >= 1) {
        repo.requiredReviews = fromRules;
      } else {
        const b = await gh.request(`/repos/${full}/branches/${enc(branch)}`);
        const protectedBranch = (b.data as Json | null)?.protected;
        if (protectedBranch === false) {
          repo.requiredReviews = pr.length ? fromRules : 0;
        } else {
          const p = await gh.request(`/repos/${full}/branches/${enc(branch)}/protection`);
          if (p.status === 200) {
            const reviews = (p.data as { required_pull_request_reviews?: { required_approving_review_count?: number } }).required_pull_request_reviews;
            repo.requiredReviews = reviews ? Math.max(reviews.required_approving_review_count ?? 0, fromRules) : fromRules;
          } else if (p.status === 404) {
            repo.requiredReviews = fromRules;
          } else {
            unreadable++;
          }
        }
      }

      const sa = r.security_and_analysis as { secret_scanning?: { status?: string } } | undefined;
      if (sa?.secret_scanning?.status) repo.secretScanning = sa.secret_scanning.status === 'enabled';
      if (isAdmin) {
        const v = await gh.request(`/repos/${full}/vulnerability-alerts`);
        if (v.status === 204) repo.dependabotAlerts = true;
        else if (v.status === 404) repo.dependabotAlerts = false;
      }
      return repo;
    });
    if (unreadable) errors.push(`Branch protection: ${unreadable} repositories could not be read (needs admin access to the repository).`);
    if (out.some(r => r.secretScanning === undefined)) errors.push('Secret scanning and Dependabot settings are only visible to repository admins; those repositories were skipped.');
    if (repos.length === MAX_REPOS) errors.push(`Only the first ${MAX_REPOS} active repositories were checked.`);
    return out;
  });

  return { inventory, errors, account: org };
}

/** Organizations the token can see, for the connect dialog. */
export async function githubOrgs(token: string): Promise<{ id: string; label: string }[]> {
  const orgs = await githubClient(token).list<{ login: string; description?: string | null }>('/user/orgs', 500);
  return orgs.map(o => ({ id: o.login, label: o.login }));
}
