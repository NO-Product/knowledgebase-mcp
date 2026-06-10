# Storage Adapter Notes

The default content source is the filesystem-backed `FileSystemContentSource`. This keeps the template database-free and deployable on Vercel with committed Markdown.

Future storage backends should preserve the existing content-source boundary:

- list metadata entries;
- read one content body by stable key;
- keep `knowledge://` URI validation and surface isolation in server code;
- keep indexing deterministic at build time unless a runtime index is explicitly introduced.

## Vercel Blob

Vercel Blob can support drag-and-drop or runtime uploads in a downstream app, but it changes the model:

- uploaded files need schema validation and MIME checks;
- search indices need a regeneration or incremental indexing strategy;
- private content needs access control before upload and retrieval;
- deletes and overwrites need auditability;
- provider-backed search should not become mandatory for the default path.

Do not add a drag-and-drop upload UI until protocol correctness, auth, logging, and public-template security are stable.
