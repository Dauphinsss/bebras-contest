import { useEffect, useState } from "react";

export type AuthoringImageSize = { width: number; height: number };

/** Only loaded natural dimensions; a replaced/failed image never gets a guessed ratio. */
export function useAuthoringImageSizes(urls: string[]) {
  const [sizes, setSizes] = useState<Record<string, AuthoringImageSize>>({});
  const sources = JSON.stringify([...new Set(urls)].sort());
  useEffect(() => {
    let active = true;
    const images = (JSON.parse(sources) as string[]).map((url) => {
      const image = new Image();
      image.onload = () => {
        if (!active || !image.naturalWidth || !image.naturalHeight) return;
        const size = { width: image.naturalWidth, height: image.naturalHeight };
        setSizes((previous) => ({ ...previous, [url]: size }));
      };
      image.src = url;
      return image;
    });
    return () => {
      active = false;
      for (const image of images) image.onload = null;
    };
  }, [sources]);
  return sizes;
}
