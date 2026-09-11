# MongoDB migration TODO

Deployment checklist for the current code, including the earlier group-permission changes. These migrations have **not** been run against a live database. Check which legacy records actually exist; already-correct records need no update. Preserve existing account and resource IDs.

**Login first:** password accounts need a valid stored `users.tokenVersion`; Google accounts also need a trustworthy `users.googleSubject` binding. Missing group or resource ownership affects permissions after login, not password validation itself.

## 1. Before deployment: stored session versions

- [ ] Check `users` for missing `tokenVersion` and backfill those records to `1`.

  ```javascript
  // mongosh, connected to the application's existing database
  db.users.countDocuments({ tokenVersion: { $exists: false } });
  db.users.updateMany(
    { tokenVersion: { $exists: false } },
    { $set: { tokenVersion: 1 } }
  );
  ```

  Separately inspect null, nonnumeric, fractional, nonpositive or unsafe-integer values and repair affected accounts deliberately. **Never reset valid existing versions to 1:** their higher versions invalidate older sessions.

  Why: shared authentication queries the stored document by account ID, email and exact token version. A Mongoose default does not backfill MongoDB. A legacy password login can issue a cookie while other services subsequently reject it because the stored version is absent.

  Verify: the missing-field count is zero; sign in with an existing password account and call protected auth, group, vision and label endpoints. Sessions with absent or outdated version claims must sign in again.

  Source: [shared session validation](libs/backend-core/src/auth/session.ts), [User model](apps/backend/auth-service/src/models/User.ts).

## 2. Before Google users return: immutable provider identities

- [ ] Identify existing Google accounts without a nonempty `users.googleSubject`. Map each intended Visin account `_id` to its authoritative Google ID-token `sub`, then persist that string on the existing account.

  Do not derive this mapping solely from email equality or copy email into `googleSubject`. Preserve passwords, roles, IDs and existing valid provider bindings. Resolve ambiguous identities before assigning access. Google-only accounts without a known subject have no working Google login until reconciled.

  Password users can instead sign in and use **Link Google sign-in**, confirming their current password and Google identity. Leave the field absent on unlinked accounts; the linking update specifically matches an absent field.

- [ ] Check for duplicate or empty-string Google subjects before starting the updated auth service. Resolve incorrect bindings, then verify the unique partial `googleSubject` index exists. Auth startup calls `User.createIndexes()` and fails if the required indexes cannot be created.

  Verify: migrated users can Google-login to their original account IDs; an unrelated Google account with a matching email cannot enter them.

  Sources: [Google account migration notes](apps/backend/auth-service/README.md#google-account-linking), [Google linking](apps/backend/auth-service/src/services/googleLinkService.ts).

## 3. Restore access to legacy groups and projects

These items are required only where the earlier account-ID/group-permission migration has not already been completed.

- [ ] Migrate email-only `groups.members[]` entries to `userId: String(users._id)` using a confirmed account mapping. Convert legacy `groups.createdBy` values to the creator's account ID as well. Keep email only as display metadata.

  Preserve intended roles and joined dates. Reconcile duplicate entries for the same account and ensure each live group has a recoverable owner. Unresolved members must be explicitly invited again rather than automatically receiving authority through an email match. Existing groups without `__v` are handled by the code; no blanket version-key backfill is needed.

- [ ] Check `projects.ownerId` identifies the intended existing user as a string. Populate `projects.editorGroupIds` with the string IDs of the live groups that should edit that project, where shared editing is intended.

  An empty/missing editor group array leaves editing with the project owner. Every current member of an assigned group can edit the project's training data; group assignment does not grant project-owner administration rights.

- [ ] Reconcile legacy training/project and descendant references where necessary. `trainings.projectId` must contain the project's canonical `_id` string, not a slug or display name. Epoch `trainingId` references, test-result `epoch_uuid` references and benchmark parent references must resolve to their intended existing parents. Do not move or reparent records merely to bypass a permission failure.

  Verify: an intended group member can access a private project and create/update a training; an unrelated account cannot. Project owners can still manage grants. Label jobs/bundles must reference the intended existing group IDs.

  Sources: [group identity contract](apps/backend/group-service/README.md#account-identities-and-invitations), [project access](apps/backend/vision-service/src/services/projectAccessService.ts), [write access](apps/backend/vision-service/src/services/writeAccessService.ts).

## 4. Restore editing of legacy standalone resources and libraries

- [ ] Assign `ownerId: String(users._id)` from an explicit ownership mapping to legacy resources that must remain editable:

  | Collection | Records needing an owner |
  | --- | --- |
  | `trainings` | Standalone trainings without a project |
  | `comparisons` | Standalone comparisons without a project |
  | `benchmarks` | Standalone benchmarks without training/epoch parents |
  | `training_datasets` | Shared dataset library records |
  | `dataset_analyses` | Dataset analysis records, including the parents of images/categories |

  Leave unresolved records read-only, as agreed. Do not give all records to the first user who edits them. Project-bound records inherit project permission; adding a standalone owner does not override it.

- [ ] Check `datasetimages.datasetId` (ObjectId) and `imagecategories.datasetId` (string) point to the intended `dataset_analyses._id`. Image/category editing uses that parent's owner; adding an owner field directly to an image will not restore permission.

  Several owner fields are immutable through Mongoose. Implement these operator backfills through explicit MongoDB updates with the confirmed IDs, preserving all unrelated fields.

  Verify: the assigned owner can edit an affected legacy record; another user cannot. Existing read-only records remain readable under their normal visibility rules.

  Sources: [ownership policy](apps/backend/vision-service/README.md#project-groups-and-write-permission), [write access](apps/backend/vision-service/src/services/writeAccessService.ts).

## 5. Existing uploads: reconcile only workflows that must continue

- [ ] For legacy `uploadreservations` that must still be attached/completed, backfill missing `maxBytes` from `getUploadPolicy(fileId, mimetype, kind).maxBytes` in backend-core. Preserve any existing stricter allowance. Reject unsupported format/kind combinations and files exceeding the policy; do not use the uploaded file's size as its allowance.

  Preserve `ownerId`, `kind`, `parentId`, `allocationId`, expiry, attachment fields and retirement state. Missing ownership/provenance needs separate reconciliation, not just a byte-limit backfill. Already-attached files remain readable without this backfill; the check runs when claiming an upload.

- [ ] Reissue old signed upload URLs through the new flow. URLs without a file-service reservation identity no longer work. For interrupted legacy uploads, start a fresh reservation with a fresh file ID and re-upload; do not treat old partial bytes as completed files. Do not revive expired or retired reservations.

- [ ] Where legacy file deletion/cleanup must work, reconcile existing file references with their actual owning resource and reservation. Create attachment provenance only when the owner, parent, resource and file association are established. Keep unresolved bytes: the new deletion path intentionally does not delete files without matching reservation provenance.

  Verify: an affected upload completes and attaches once, a conflicting attachment fails, and deleting one resource cannot delete another resource's file.

  Sources: [reservation schema](apps/backend/vision-service/src/models/UploadReservation.ts), [claim/deletion rules](apps/backend/vision-service/src/services/uploadReservationService.ts), [upload policy](libs/backend-core/src/uploads/policy.ts).

## 6. OAuth connections: reconnect existing clients

- [ ] Have users reauthorize existing OAuth/MCP connections after deployment. New authorization creates `oauth_grants` and refresh-token history containing `grantId` and `generation`.

  Old `oauth_refresh_tokens` rows without those fields are deliberately rejected with `invalid_grant` and do not appear as authoritative connections. No database backfill is necessary if users reconnect; existing client registrations can remain. Reconnection is the default migration path for this release. Preserving old refresh sessions would require a separately implemented and validated grant migration, not fabricated generation fields on old rows.

  Verify: a reconnected client can refresh and appears in Connections; disconnect prevents subsequent refreshes. Previously issued access tokens can remain usable until their existing expiry.

  Sources: [OAuth models](libs/backend-core/src/oauth/models.ts), [refresh validation](libs/backend-core/src/oauth/service.ts).

## 7. Label jobs: restore intentional public sharing only

- [ ] Review existing `labeljobs` that should still be publicly accessible. Set `isPublic: true` only on deliberately selected jobs, using the group-admin visibility action or an explicit ID-based migration. They must also be `active` to be visible outside their group.

  Missing `isPublic` is treated as private. Group members retain access; no backfill is required for private jobs. Do not bulk-publish every previously active job. Answers, tasks and bundles do not need rewriting for this visibility change.

  Verify: selected public active jobs work anonymously; private, paused and archived jobs do not expose task/image content outside their group.

  Source: [job read policy](apps/backend/label-service/src/services/jobAccessService.ts).

## No data migration required

- Existing file-service files and download URLs: original on-disk paths remain readable. `file_uploads` records are created for new reservations/writes; no bulk import, GridFS conversion or SQLite migration is required.
- Existing administrator accounts: keep their IDs and roles. Do not populate `bootstrapSlot` on all users or rerun public setup. If the installation has users but no administrator, use the documented [existing-account recovery command](apps/backend/auth-service/README.md#first-run-setup-and-recovery).
- Archive validation and response-privacy changes do not require rewriting stored archives or training result data. Legacy archives that violate the new ingest limits may need to be repackaged if imported again.
- The MongoDB file-service rewrite requires its existing `MONGODB_URI` setting to be available and its data volume retained. Auth/session consumers must use the database containing the shared `users` collection. These are configuration checks, not new database migrations.

## Execution and completion

- [ ] Take a database backup before applying updates. Record affected IDs/counts, run identity/permission backfills with relevant writers stopped, and preserve valid existing values.
- [ ] Verify auth startup/index creation and the login, permission, upload, OAuth and public-job checks above against migrated data before reopening normal use.
- [ ] Remove each applicable task only after its migration/reconnection and verification are complete; mark tasks with no affected legacy records as not applicable.
