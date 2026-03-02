# Agent Instructions: Legacy Database Discovery and Seed Script Update

> **Purpose:** This agent reads the local `legacydb/` directory (which contains a MongoDB mongodump backup) and updates the seed-db scripts so that users can restore from a legacy database dump. It also documents the legacy database structure for alignment of future migration work.

## Important Constraints

- The `legacydb/` directory exists only in the local copy of the repository. It must **never** be uploaded to GitHub.
- **No filenames** from inside `legacydb/` should appear anywhere in committed code, scripts, or documentation.
- Scripts must discover paths dynamically (using glob/find patterns), never hardcode filenames.

---

## Task 1: Discover Legacy Database Structure

1. List the contents of `legacydb/` recursively to understand the directory structure.
2. A mongodump typically creates a directory per database, containing `.bson` and `.metadata.json` files per collection.
3. Identify:
   - The database name(s) (top-level directories inside `legacydb/`)
   - The collections present (`.bson` files)
   - For each collection, examine the `.metadata.json` file if present to understand indexes
4. Using `bsondump` (or a Python script with `bson` library), sample a few documents from each collection to understand the document structure (field names, types, nesting).
5. Document your findings in a structured format. Compare the discovered structure against the Mongoose models in `server/src/models/` to confirm backward compatibility.

### Output for Task 1

Update the "Legacy App Analysis" section in `MIGRATION.md` with any new findings about:
- Collection names and their correspondence to new Mongoose models
- Any fields in the legacy data not present in the new models (or vice versa)
- Index definitions that should be replicated
- Any data format differences (e.g., date formats, ID formats, nested structures)

---

## Task 2: Update Seed Scripts for Legacy DB Restore

The seed scripts are located at:
- `scripts/seed-db.sh` (native)
- `scripts/seed-db-docker.sh` (Docker)

### Requirements

1. **Add a "restore from legacy dump" option** to both scripts.
2. The script should:
   - Search the `legacydb/` directory for subdirectories that look like mongodump output (contain `.bson` files).
   - If multiple candidate directories are found, present them to the user and let them choose which one to restore from.
   - Never hardcode any directory or file names from `legacydb/`.
   - Use `mongorestore` to restore the selected dump into the configured MongoDB instance.
   - Warn the user that this will overwrite existing data and ask for confirmation.
   - Support both the native MongoDB connection and the Docker MongoDB container.
3. The restore option should be offered alongside the existing seed options (e.g., "1) Seed with test data, 2) Restore from legacy dump, 3) Reset to empty").

### Script Pattern (pseudocode)

```bash
# Find candidate dump directories
candidates=$(find legacydb/ -name "*.bson" -exec dirname {} \; | sort -u)

if [ -z "$candidates" ]; then
  echo "No mongodump data found in legacydb/"
  exit 1
fi

# Let user choose if multiple
echo "Found the following dump directories:"
select dir in $candidates; do
  echo "Restoring from: $dir"
  mongorestore --drop --uri="$MONGO_URI" "$dir"
  break
done
```

### Important

- The script itself will be committed to GitHub, so it must not contain any literal filenames from `legacydb/`.
- Use dynamic discovery (find, ls, glob) to locate dump data.
- The `legacydb/` directory is already in `.gitignore`.

---

## Task 3: Verify Compatibility

After discovering the legacy database structure:

1. Check that each legacy collection maps to a Mongoose model in `server/src/models/`.
2. Verify that field names match (especially the Meteor conventions):
   - `users` collection: `_id` is a string (not ObjectId), passwords in `services.password.bcrypt`, emails in `emails[]` array
   - Other collections: Check `_id` format, date fields, reference fields
3. Flag any fields in the legacy data that are missing from the new models (these may need to be added for full backward compatibility). Report this in MIGRATION.md
4. Flag any new fields added in the new models (like `lastLogin`) that won't exist in legacy data — ensure they have appropriate defaults or are optional. Report back in MIGRATION.md, but don't update code.

---

## Deliverables

1. Updated `MIGRATION.md` — "Legacy App Analysis" section with discovered structure details and findings about compatability.
2. Updated `scripts/seed-db.sh` — with legacy dump restore option
3. Updated `scripts/seed-db-docker.sh` — with legacy dump restore option
4. This file can be removed or archived once the tasks are complete.
