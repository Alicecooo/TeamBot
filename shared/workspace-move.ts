/** Paths outside the data folder that a move to another computer cannot bring. */
export interface WorkspaceLeftBehind {
  /** Bots whose working folder stayed there; they now start in their own folder. */
  bots: number;
  /** Up to 20 of those folders and of the files their instructions name, as written there. */
  paths: string[];
}
