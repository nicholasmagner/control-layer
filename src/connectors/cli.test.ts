import { describe, expect, it } from 'vitest';
import { cliFileNames, lastErrorLine, parseSigninOutput, signinCommand } from './cli';

describe('signinCommand', () => {
  it('opens the browser on the desktop app and uses copy/paste flows on servers', () => {
    expect(signinCommand('aws', true).args).toEqual(['login', '--profile', 'controllayer']);
    expect(signinCommand('aws', false).args).toContain('--remote');
    expect(signinCommand('gcp', true).args).toEqual(['auth', 'application-default', 'login']);
    expect(signinCommand('gcp', false).args).toContain('--no-launch-browser');
    expect(signinCommand('azure', true).args).not.toContain('--use-device-code');
    expect(signinCommand('azure', false).args).toContain('--use-device-code');
  });

  it('turns off the Azure CLI subscription picker so it never waits on a hidden prompt', () => {
    expect(signinCommand('azure', true).env.AZURE_CORE_LOGIN_EXPERIENCE_V2).toBe('off');
  });
});

describe('parseSigninOutput', () => {
  it('finds sign-in links in gcloud output', () => {
    const out = 'Go to the following link in your browser, and complete the sign-in prompts:\n\n    https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=abc\n\nOnce finished, enter the verification code provided in your browser:';
    expect(parseSigninOutput(out)).toEqual({ urls: ['https://accounts.google.com/o/oauth2/auth?response_type=code&client_id=abc'], code: null });
  });

  it('finds the Azure device code and strips terminal colors', () => {
    const out = '\x1b[93mTo sign in, use a web browser to open the page https://microsoft.com/devicelogin and enter the code ABCD1234 to authenticate.\x1b[0m';
    expect(parseSigninOutput(out)).toEqual({ urls: ['https://microsoft.com/devicelogin'], code: 'ABCD1234' });
  });
});

describe('cliFileNames', () => {
  it('uses the Windows launcher names', () => {
    expect(cliFileNames('gcloud', 'win32')).toContain('gcloud.cmd');
    expect(cliFileNames('az', 'win32')).toContain('az.cmd');
    expect(cliFileNames('aws', 'win32')).toContain('aws.exe');
    expect(cliFileNames('aws', 'darwin')).toEqual(['aws']);
  });
});

describe('lastErrorLine', () => {
  it('surfaces the CLI error instead of an exit code', () => {
    expect(lastErrorLine('Go to the following link\nERROR: (gcloud.auth.application-default.login) Invalid authorization code.\n'))
      .toBe('(gcloud.auth.application-default.login) Invalid authorization code.');
    expect(lastErrorLine('all fine')).toBeNull();
  });
});

describe('GitHub and Microsoft 365 sign-in', () => {
  it('reads the GitHub one-time code and link', () => {
    const out = '! First copy your one-time code: 1A2B-3C4D\nOpen this URL to continue in your web browser: https://github.com/login/device\n';
    expect(parseSigninOutput(out)).toEqual({ urls: ['https://github.com/login/device'], code: '1A2B-3C4D' });
  });
  it('allows Microsoft 365 tenants without an Azure subscription', () => {
    expect(signinCommand('m365', true).args).toContain('--allow-no-subscriptions');
    expect(signinCommand('azure', true).args).not.toContain('--allow-no-subscriptions');
    expect(signinCommand('github', false).env.GH_BROWSER).toBe('echo');
  });
});
