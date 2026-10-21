import type { Adjustments, CropState, ShapeId } from "../photoMath";

export type PhotoEditorSettings = { shape: ShapeId; crop: CropState; adjustments: Adjustments };
export type PhotoEditorResult = { file: File; settings: PhotoEditorSettings };

export type PhotoEditorProps = {
  open: boolean;
  /** A loaded image whose pixels the canvas may read (same-origin, blob, or CORS-enabled). */
  image: HTMLImageElement | null;
  /** Changes whenever a new editing session starts, so state resets. */
  sessionKey: string | number;
  initialSettings?: Partial<PhotoEditorSettings>;
  title?: string;
  description?: string;
  fileBaseName?: string;
  onCancel: () => void;
  onApply: (result: PhotoEditorResult) => void;
};
