# SPAS 360 to NDAI Brain sync

SPAS 360 mirrors Ari activity into the NDAI Brain project for owner-level fleet observability. The application database remains the system of record.

## Security boundary

- The receiver stores only a SHA-256 credential hash in `private.ingest_credentials`.
- The plaintext credential exists only in the SPAS 360 Supabase Vault under `spas_brain_sync_token`.
- Receiver function source contains no credential.
- The receiver's verification RPC is callable only by its service role.
- Sender functions and the `brain_sync` schema are executable/readable only by Postgres.

## Delivery contract

`brain_sync.enqueue()` converts new Ari messages and deliverables into stable, source-identified batches. `brain_sync.dispatch()` sends pending batches, reconciles `pg_net` responses, and retries failures with bounded exponential backoff. Watermarks advance only after all batches for a stream watermark are confirmed delivered.

The NDAI Brain tables enforce `(source_system, source_id)` uniqueness, so retries are idempotent.

## Rotation

1. Create a new random Vault value inside the SPAS 360 database. Do not return or print the plaintext.
2. Compute its SHA-256 hash inside the sender database.
3. Replace the active `spas-360` hash in the receiver's private credential table.
4. Deploy the receiver, apply the sender migration, and run `brain_sync.probe()`.
5. Verify a `2xx` row in `net._http_response` and confirm no credential literal exists in function source.
