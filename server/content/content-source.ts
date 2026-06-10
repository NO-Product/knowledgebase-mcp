export type ContentMetadata = {
  key: string;
  uri: string;
  relativePath: string;
  domain: string;
  title: string;
  metadata: Record<string, unknown>;
};

export type ContentEntry = ContentMetadata & {
  content: string;
};

export interface ContentSource {
  id: string;
  listMetadata(): ContentMetadata[];
  readBody(key: string): string | null;
  filePathForKey?(key: string): string | null;
}
