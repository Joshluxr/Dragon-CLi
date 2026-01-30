export interface Typeahead {
  getSuggestions: (
    query: string,
  ) => Promise<{ name: string; type?: "blob" | "tree" }[]>;
}
