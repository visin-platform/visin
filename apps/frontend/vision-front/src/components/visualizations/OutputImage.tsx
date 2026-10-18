import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, type SxProps, type Theme } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { Visualization } from '../../types';
import { freshImageUrl, useClassColours, useNearViewport } from '../../hooks/useOutputImages';
import {
  describePixel,
  greyValues,
  hexRgb,
  isDecodedKind,
  paintConfidence,
  paintMask,
  presentClasses,
  rampLut,
  type OutputClass,
  type Rgb
} from '../../utils/outputPixels';

type ShownVisualization = Pick<Visualization, 'visualization_uuid' | 'type' | 'filename' | 'signedUrl' | 'urlExpiresAt'>;

interface Decoded {
  width: number;
  height: number;
  /** one value per pixel, or `undefined` for a mask that already carries its own colours */
  values?: Uint8Array;
  /** the pixels as they are, for a mask with its own palette */
  rgba?: Uint8ClampedArray;
  present: number[];
}

/** The image's bytes, asking for a new link once when the one in hand has expired or is refused. */
async function download(visualization: ShownVisualization): Promise<Blob> {
  let response = await fetch(await freshImageUrl(visualization));
  if (!response.ok) response = await fetch(await freshImageUrl(visualization, true));
  if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
  return response.blob();
}

/**
 * The image's pixels as stored. `colorSpaceConversion: 'none'` keeps the browser from colour-managing a class index
 * into a neighbouring one; a thumbnail is scaled with nearest-neighbour sampling for the same reason.
 */
async function decode(visualization: ShownVisualization, maxWidth?: number): Promise<Decoded> {
  const full = await createImageBitmap(await download(visualization), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none'
  });
  const scaled =
    maxWidth && full.width > maxWidth
      ? await createImageBitmap(full, {
          resizeWidth: maxWidth,
          resizeHeight: Math.max(1, Math.round((full.height * maxWidth) / full.width)),
          resizeQuality: 'pixelated'
        })
      : full;
  const canvas = document.createElement('canvas');
  canvas.width = scaled.width;
  canvas.height = scaled.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No 2D canvas');
  context.drawImage(scaled, 0, 0);
  const rgba = context.getImageData(0, 0, scaled.width, scaled.height).data;
  const values = greyValues(rgba);
  return {
    width: scaled.width,
    height: scaled.height,
    ...(values ? { values } : { rgba }),
    present: values ? presentClasses(values) : []
  };
}

const canDecode = () => typeof createImageBitmap === 'function' && typeof document !== 'undefined';

const parsedColours = new Map<string, Rgb | undefined>();

/** Any CSS colour a canvas understands, as its channels; a mask asks for all 256 indices, so each is parsed once. */
const cssRgb = (colour: string): Rgb | undefined => {
  if (parsedColours.has(colour)) return parsedColours.get(colour);
  let rgb = hexRgb(colour);
  if (!rgb) {
    const context = document.createElement('canvas').getContext('2d');
    if (context) {
      context.fillStyle = colour;
      rgb = hexRgb(String(context.fillStyle));
    }
  }
  parsedColours.set(colour, rgb);
  return rgb;
};

interface OutputImageProps {
  visualization: ShownVisualization;
  /** the classes the mask's indices stand for; a confidence map's floor is one over their count */
  classes?: OutputClass[];
  /** the widest a decoded thumbnail needs to be, to keep a gallery's memory small */
  maxWidth?: number;
  alt?: string;
  sx?: SxProps<Theme>;
  onClick?: () => void;
  /** what is under the pointer, for a viewer's readout; `null` when it leaves */
  onPixel?: (reading: string | null) => void;
  /** the class indices a mask was found to use, once decoded */
  onDecoded?: (present: number[]) => void;
}

/** A picture shown as it is. A link that has expired by the time the browser asks is replaced, once. */
const PlainImage: React.FC<Pick<OutputImageProps, 'visualization' | 'sx' | 'onClick'> & { alt: string }> = ({
  visualization,
  alt,
  sx,
  onClick
}) => {
  const [src, setSrc] = useState(visualization.signedUrl || '');
  const [retried, setRetried] = useState(false);
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      loading="lazy"
      onClick={onClick}
      onError={() => {
        if (retried) return;
        setRetried(true);
        freshImageUrl(visualization, true).then(setSrc, () => undefined);
      }}
      sx={sx}
    />
  );
};

/**
 * One visualization. A `mask` is painted in its classes' colours and a `confidence` map on a dark-to-bright ramp;
 * anything else, or anything that cannot be decoded here, is shown as the image it is.
 */
const OutputImage: React.FC<OutputImageProps> = (props) => {
  const { visualization, alt = visualization.filename, sx, onClick } = props;
  if (isDecodedKind(visualization.type) && visualization.signedUrl && canDecode()) {
    return <DecodedOutput key={visualization.visualization_uuid} {...props} kind={visualization.type} alt={alt} />;
  }
  // Keyed so another frame in the same place, or a refreshed link, starts from its own URL.
  return (
    <PlainImage
      key={`${visualization.visualization_uuid}:${visualization.signedUrl}`}
      visualization={visualization}
      alt={alt}
      sx={sx}
      onClick={onClick}
    />
  );
};

const DecodedOutput: React.FC<OutputImageProps & { kind: 'mask' | 'confidence'; alt: string }> = ({
  visualization,
  kind,
  classes,
  maxWidth,
  alt,
  sx,
  onClick,
  onPixel,
  onDecoded
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const near = useNearViewport(canvasRef);
  const { data, isError } = useQuery({
    queryKey: ['output-pixels', visualization.visualization_uuid, maxWidth ?? 'full'],
    queryFn: () => decode(visualization, maxWidth),
    enabled: near,
    staleTime: Infinity,
    gcTime: 60_000,
    retry: false
  });
  const colourOf = useClassColours(classes);
  // Held aside so a caller's inline callback does not repaint the canvas on every render.
  const decodedRef = useRef(onDecoded);
  decodedRef.current = onDecoded;
  const lut = useMemo(() => rampLut(), []);
  const floor = classes && classes.length > 1 ? 1 / classes.length : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!data || !canvas || !context) return;
    canvas.width = data.width;
    canvas.height = data.height;
    const fallback: Rgb = [0, 0, 0];
    const pixels = data.values
      ? kind === 'mask'
        ? paintMask(data.values, (index) => cssRgb(colourOf(index)) ?? fallback)
        : paintConfidence(data.values, lut, floor)
      : data.rgba!;
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), data.width, data.height), 0, 0);
    decodedRef.current?.(data.present);
  }, [data, kind, colourOf, lut, floor]);

  const readPixel = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPixel || !data?.values) return;
    const box = event.currentTarget.getBoundingClientRect();
    // The canvas is drawn `contain`ed, so the picture may be letterboxed inside its box.
    const scale = Math.min(box.width / data.width, box.height / data.height);
    const x = Math.floor((event.clientX - box.left - (box.width - data.width * scale) / 2) / scale);
    const y = Math.floor((event.clientY - box.top - (box.height - data.height * scale) / 2) / scale);
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) return onPixel(null);
    onPixel(describePixel(kind, data.values[y * data.width + x], classes));
  };

  if (isError) return <PlainImage visualization={visualization} alt={alt} sx={sx} onClick={onClick} />;
  return (
    <Box
      component="canvas"
      ref={canvasRef}
      role="img"
      aria-label={alt}
      aria-busy={!data}
      onClick={onClick}
      onMouseMove={readPixel}
      onMouseLeave={() => onPixel?.(null)}
      sx={[{ display: 'block', objectFit: 'contain', imageRendering: 'pixelated' }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
};

export default OutputImage;
