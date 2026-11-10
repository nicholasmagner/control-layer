# Preparing for an audit

A step-by-step path from first scan to handing your auditor an evidence package. Back to the [README](../README.md).

1. **Scope.** Pick your framework in the sidebar and mark controls outside your audit scope as Not Applicable, with a reason.
2. **Fix.** Work through **Findings**, starting with High severity. Accept risks you won't fix, with a reason.
3. **Policies.** Under **Policies**, add the templates, adjust them to how you work, and publish. Add your team under **People** and send everyone their sign-off link. Mark people as having left when they go, so the offboarding checks can confirm their access is gone.
4. **Run the program.** Add your vendors and record reviews for the high-risk ones; add risks from the library and complete the risk assessment; run a quarterly access review. Each of these is saved as dated evidence.
5. **Document.** For each control still showing *Needs Evidence*, upload what the control lists under "What auditors usually ask for". One document can support several controls and frameworks.
6. **Assign owners** to controls so everyone knows who keeps evidence current.
7. **Invite your auditor** under **Settings** with the *Auditor* role. They can review everything and download packages, but cannot change anything.
8. **Export.** Under **Evidence & Audits**, choose the framework and audit period and download the package. It includes each published policy version and who accepted it. Record the *chain head* printed in its `README.txt`; a later package whose chain still contains it shows that earlier evidence was not altered.

## How controls are assessed

Controls not covered by an automated check are met by publishing the matching policy and by the records ControlLayer keeps for you: vendor reviews, access reviews, the risk assessment, policy sign-off, and uploaded evidence. ISO 27001 mapping is a practical crosswalk for evidence reuse, not an official equivalence; certification also needs the management system clauses (scope, Statement of Applicability, internal audit, management review). Each control has a review window (for example 365 days for policies, 90 days for access reviews) after which it asks for fresh evidence. Mark any control you are not including in scope as *Not Applicable* with a reason, which is included in the audit package.
