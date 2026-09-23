/**
 * YOLO26/Cog stores a nameless upload as `/tmp/…file`. Ultralytics then refuses
 * it with "No images or videos found". That is an image/format failure, not a
 * dropped connection.
 */
const POSE_IMAGE_FAILURE =
  /no images or videos found|supported formats are|could not (?:read|open|load|decode)|cannot identify image|unidentified image|invalid image|failed to load image|image file is truncated|not a (?:jpeg|png|webp)|pose model could not read|image bytes are not/i;

export function isPoseSkeletonImageFailureMessage(message: string): boolean {
  return POSE_IMAGE_FAILURE.test(message);
}
