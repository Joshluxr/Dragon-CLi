import { DiffFile } from "@git-diff-view/react";
import type { DiffFileWorkerResult, DiffFileWorkerMessage } from "./git-diff";

/**
 * Web Worker for creating a DiffFile instance from a ParsedDiffFile
 */
addEventListener("message", (event) => {
  const { id, parsedFile } = event.data as DiffFileWorkerMessage;
  try {
    const data = DiffFile.createInstance({
      newFile: {
        fileName: parsedFile.fileName,
        fileLang: parsedFile.fileLang,
        content: "",
      },
      hunks: [parsedFile.fullDiff],
    });
    data?.init();
    data?.buildSplitDiffLines();
    const result: DiffFileWorkerResult = {
      id,
      bundle: data._getFullBundle(),
      error: undefined,
    };
    postMessage(result);
  } catch (error) {
    console.error("Error creating diff file", error);
    const result: DiffFileWorkerResult = {
      id,
      bundle: undefined,
      error:
        error instanceof Error ? error.message : "Error generating diff file",
    };
    postMessage(result);
  }
});
