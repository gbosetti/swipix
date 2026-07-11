# Swipix project conventions

Local context for this repo. Global conventions (dependency hardening,
commit style, branding, etc.) live in `~/.claude/CLAUDE.md` and apply here
too — this file only adds what's specific to Swipix.

## Legal documents stay in sync with the product

This repo ships both a `TERMS.md` and a `PRIVACY.md`, each mirrored inside
the app (`TermsContent`/`PrivacyContent` in `src/components`, translated
across every locale in `src/i18n/locales`). Whenever a change is made that
could affect what either document promises — new data collection, a new
permission request, a third-party SDK or analytics integration, ads,
payments/subscriptions, a change to how deletion or trash works — flag it
and discuss with the user before editing `TERMS.md`/`PRIVACY.md` or their
in-app copy. Don't update these documents unprompted; confirm the wording
first, since they're legal-facing and the user may want to review or
phrase it themselves. If it's unclear whether a change is legally
relevant, ask rather than skip it.

Swipix ships in es/it/fr as well as English, so the global GDPR
conventions apply concretely here — real EU users, not a hypothetical.
