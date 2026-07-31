# SPAS 360 migration connectors

Provider registrations live outside the application runtime, but their
non-secret configuration is versioned here so OAuth can be audited and
reproduced.

## HubSpot

- App: `SPAS 360 Migration Connector`
- App ID: `47592919`
- Platform: `2026.03`
- Distribution: unlisted marketplace OAuth
- Callback: `https://spas360solo.vercel.app/api/migrations/callback-hubspot`
- Required scopes: OAuth, contacts read, companies read, deals read
- Configuration source: `integrations/hubspot`

Upload configuration changes with the HubSpot CLI from the
`integrations/hubspot` directory. Client credentials belong only in Vercel
server environment variables.

## Jobber

- App: `SPAS 360 Migration Connector`
- Developer Center app path: `/apps/MTYwMDg0`
- Status: draft custom integration
- Callback: `https://spas360solo.vercel.app/api/migrations/callback-jobber`
- Read scopes: clients, requests, quotes, jobs, invoices
- Refresh-token rotation: enabled

Jobber does not provide a project file export. The registration is documented
here; its client credentials belong only in Vercel server environment
variables.

## Credential rule

SPAS 360 never receives or stores a provider password. A company owner signs in
directly on HubSpot or Jobber and grants scoped OAuth access. Access and refresh
tokens are encrypted with AES-256-GCM before they are stored in the server-only
migration tables.
