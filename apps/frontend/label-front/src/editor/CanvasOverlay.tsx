import React from 'react';
import { useTheme } from '@mui/material';
import { livePalette, onImage } from '@visin/frontend-core';
import type { BoxObject, JobClass } from '../types';
import type { EditorDocument } from './EditorDocument';
import { type Bbox, HANDLES, handlePoint } from './boxes';
import type { EditorTool, SamState } from './EditorCanvas';

const HANDLE_SIZE_PX = 9;

interface CanvasOverlayProps {
  doc: EditorDocument;
  /** the selected box, as the canvas already looked it up */
  selected: BoxObject | undefined;
  tool: EditorTool;
  readOnly: boolean;
  classByKey: Map<string, JobClass>;
  /** a class's colour as it should draw in the scheme showing */
  colorOf: (jobClass: JobClass) => string;
  activeClass: JobClass | null;
  suggestionBoxes: BoxObject[];
  /** the box being dragged out, in frame coordinates */
  draft: Bbox | null;
  sam?: SamState;
  samColor: string;
  /** frame → screen: zoom and where the frame's corner sits */
  scale: number;
  offsetX: number;
  offsetY: number;
  /** a brush or eraser is in use, so its ring follows the pointer */
  brushActive: boolean;
  hover: { x: number; y: number } | null;
  brushRadius: number;
}

/** Everything drawn over the frame as vectors: boxes, suggestions, the draft, handles, segment clicks, the brush ring. */
const CanvasOverlay: React.FC<CanvasOverlayProps> = ({
  doc,
  selected,
  tool,
  readOnly,
  classByKey,
  colorOf,
  activeClass,
  suggestionBoxes,
  draft,
  sam,
  samColor,
  scale,
  offsetX,
  offsetY,
  brushActive,
  hover,
  brushRadius
}) => {
  const palette_ = livePalette(useTheme());
  const toScreen = (bbox: Bbox) => ({ x: bbox[0] * scale + offsetX, y: bbox[1] * scale + offsetY, w: bbox[2] * scale, h: bbox[3] * scale });
  const colorFor = (classKey: string): string => {
    const found = classByKey.get(classKey);
    return found ? colorOf(found) : onImage.ink;
  };

  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} aria-hidden="true">
      {suggestionBoxes.map((box) => {
        const rect = toScreen(box.bbox);
        const color = colorFor(box.classKey);
        return (
          <rect
            key={`s-${box.id}`}
            data-testid="suggestion-box"
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        );
      })}
      {doc.boxes.map((box) => {
        const rect = toScreen(box.bbox);
        const color = colorFor(box.classKey);
        const isSelected = box.id === doc.selectedId;
        return (
          <g key={box.id}>
            <rect
              data-testid="box"
              data-selected={isSelected}
              x={rect.x}
              y={rect.y}
              width={rect.w}
              height={rect.h}
              fill={color}
              fillOpacity={isSelected ? 0.18 : 0.1}
              stroke={color}
              strokeWidth={isSelected ? 3 : 2}
            />
            <text x={rect.x + 3} y={Math.max(11, rect.y - 4)} fill={color} fontSize={12} fontWeight={600}>
              {classByKey.get(box.classKey)?.name ?? box.classKey}
            </text>
          </g>
        );
      })}
      {draft && (
        <rect
          data-testid="draft-box"
          x={toScreen(draft).x}
          y={toScreen(draft).y}
          width={toScreen(draft).w}
          height={toScreen(draft).h}
          fill="none"
          stroke={activeClass ? colorOf(activeClass) : onImage.ink}
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      )}
      {selected &&
        !readOnly &&
        tool === 'box' &&
        HANDLES.map((handle) => {
          const point = handlePoint(selected.bbox, handle);
          return (
            <rect
              key={handle}
              data-testid={`handle-${handle}`}
              x={point.x * scale + offsetX - HANDLE_SIZE_PX / 2}
              y={point.y * scale + offsetY - HANDLE_SIZE_PX / 2}
              width={HANDLE_SIZE_PX}
              height={HANDLE_SIZE_PX}
              fill={onImage.ink}
              stroke={colorFor(selected.classKey)}
              strokeWidth={1.5}
            />
          );
        })}
      {sam?.box && (
        <rect
          data-testid="sam-box"
          x={toScreen(sam.box).x}
          y={toScreen(sam.box).y}
          width={toScreen(sam.box).w}
          height={toScreen(sam.box).h}
          fill="none"
          stroke={samColor}
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      )}
      {sam?.points.map((point, index) => (
        <circle
          key={index}
          data-testid="sam-point"
          data-label={point.label}
          cx={point.x * scale + offsetX}
          cy={point.y * scale + offsetY}
          r={6}
          fill={point.label === 1 ? palette_.success.main : palette_.error.main}
          stroke={onImage.ink}
          strokeWidth={1.5}
        />
      ))}
      {brushActive && hover && (
        <circle
          data-testid="brush-ring"
          cx={hover.x}
          cy={hover.y}
          r={Math.max(2, brushRadius * scale)}
          fill="none"
          stroke={onImage.ink}
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
};

export default CanvasOverlay;
