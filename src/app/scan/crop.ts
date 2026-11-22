export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where an on-screen box sits in the camera's own pixels, for a video shown with object-fit: cover.
 * `margin` grows it a little, so a card that pokes past the guide still keeps its corners.
 */
export function guideInVideo(
  video: { width: number; height: number },
  shown: Box,
  guide: Box,
  margin = 0.08,
): Box {
  const scale = Math.max(shown.width / video.width, shown.height / video.height);
  const offsetX = (shown.width - video.width * scale) / 2;
  const offsetY = (shown.height - video.height * scale) / 2;
  const padX = guide.width * margin;
  const padY = guide.height * margin;
  const left = Math.max(0, (guide.x - shown.x - padX - offsetX) / scale);
  const top = Math.max(0, (guide.y - shown.y - padY - offsetY) / scale);
  const right = Math.min(video.width, (guide.x - shown.x + guide.width + padX - offsetX) / scale);
  const bottom = Math.min(video.height, (guide.y - shown.y + guide.height + padY - offsetY) / scale);
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}
