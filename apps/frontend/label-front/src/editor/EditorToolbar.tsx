import React, { useSyncExternalStore } from 'react';
import { Box, Button, Chip, IconButton, Slider, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { CropFree, Redo, Undo } from '@mui/icons-material';
import { JobClass } from '../types';
import { EditorTool } from './EditorCanvas';
import { classHotkey } from './classHotkey';
import type { EditorDocument } from './EditorDocument';

export interface EditorToolbarProps {
  /** what undo and redo act on; the toolbar watches it so the buttons enable as work is done */
  doc: EditorDocument;
  classes: JobClass[];
  colorOf: (jobClass: JobClass) => string;
  tool: EditorTool;
  onTool: (tool: EditorTool) => void;
  /** which tools the job's classes allow at all */
  canBox: boolean;
  canMask: boolean;
  activeClassKey: string | null;
  onClass: (key: string) => void;
  brushDiameter: number;
  onBrushDiameter: (value: number) => void;
  maskOpacity: number;
  onMaskOpacity: (value: number) => void;
  /** the overlay sensors the frame actually has */
  availableOverlays: { lidar: boolean; radar: boolean };
  overlays: { lidar: boolean; radar: boolean };
  onOverlays: (overlays: { lidar: boolean; radar: boolean }) => void;
  onFit: () => void;
  disabled: boolean;
  /** a model on this computer: whether it is there, and what it can do */
  model: {
    status: 'off' | 'connecting' | 'connected' | 'unreachable';
    label: string;
    canDetect: boolean;
    canSegment: boolean;
    detecting: boolean;
    onDetect: () => void;
    onOpen: () => void;
  };
}

/**
 * The few controls an annotator needs: three tools, the classes, which sensors
 * are over the frame, and brush size. Everything has a hotkey, shown on the
 * button, so the mouse is only needed to draw.
 */
const EditorToolbar: React.FC<EditorToolbarProps> = ({
  doc,
  classes,
  colorOf,
  tool,
  onTool,
  canBox,
  canMask,
  activeClassKey,
  onClass,
  brushDiameter,
  onBrushDiameter,
  maskOpacity,
  onMaskOpacity,
  availableOverlays,
  overlays,
  onOverlays,
  onFit,
  disabled,
  model
}) => {
  useSyncExternalStore(doc.subscribe, doc.getVersion);
  const painting = tool === 'brush' || tool === 'eraser';
  const overlayNames = (['lidar', 'radar'] as const).filter((key) => availableOverlays[key]);

  return (
    <Stack spacing={1} data-testid="editor-toolbar">
      <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={tool}
          onChange={(_event, next: EditorTool | null) => next && onTool(next)}
          aria-label="tool"
          disabled={disabled}
        >
          <ToggleButton value="box" disabled={!canBox} aria-label="box tool">
            Box <Box component="kbd" sx={{ ml: 0.75, opacity: 0.6 }}>B</Box>
          </ToggleButton>
          <ToggleButton value="brush" disabled={!canMask} aria-label="brush tool">
            Brush <Box component="kbd" sx={{ ml: 0.75, opacity: 0.6 }}>P</Box>
          </ToggleButton>
          <ToggleButton value="eraser" disabled={!canMask} aria-label="eraser tool">
            Eraser <Box component="kbd" sx={{ ml: 0.75, opacity: 0.6 }}>E</Box>
          </ToggleButton>
          {model.canSegment && (
            <ToggleButton value="sam" disabled={!canMask} aria-label="segment tool">
              Segment <Box component="kbd" sx={{ ml: 0.75, opacity: 0.6 }}>S</Box>
            </ToggleButton>
          )}
        </ToggleButtonGroup>

        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }} role="group" aria-label="classes">
          {classes.map((jobClass, index) => {
            const active = jobClass.key === activeClassKey;
            const hotkey = classHotkey(jobClass, index);
            return (
              <Chip
                key={jobClass.key}
                size="small"
                clickable
                disabled={disabled}
                variant={active ? 'filled' : 'outlined'}
                onClick={() => onClass(jobClass.key)}
                aria-pressed={active}
                label={hotkey ? `${hotkey} ${jobClass.name}` : jobClass.name}
                icon={
                  <Box
                    component="span"
                    sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: colorOf(jobClass), ml: '8px !important' }}
                  />
                }
                sx={active ? { fontWeight: 700, borderColor: colorOf(jobClass), borderWidth: 2, borderStyle: 'solid' } : undefined}
              />
            );
          })}
        </Stack>

        <Box sx={{ flexGrow: 1 }} />

        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {model.canDetect && (
            <Tooltip title="Suggest boxes for this frame (D)">
              <span>
                <Button size="small" variant="outlined" disabled={disabled || model.detecting} onClick={model.onDetect}>
                  {model.detecting ? 'Detecting…' : 'Detect'}
                </Button>
              </span>
            </Tooltip>
          )}
          <Chip
            size="small"
            clickable
            variant="outlined"
            color={model.status === 'connected' ? 'success' : model.status === 'unreachable' ? 'warning' : 'default'}
            label={model.label}
            onClick={model.onOpen}
            aria-label="model"
          />
        </Stack>

        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Tooltip title="Undo (Ctrl+Z)">
            <span>
              <IconButton size="small" aria-label="undo" disabled={disabled || !doc.canUndo} onClick={() => doc.undo()}>
                <Undo fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Redo (Ctrl+Shift+Z)">
            <span>
              <IconButton size="small" aria-label="redo" disabled={disabled || !doc.canRedo} onClick={() => doc.redo()}>
                <Redo fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Fit frame (F)">
            <IconButton size="small" aria-label="fit frame" onClick={onFit}>
              <CropFree fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', minHeight: 32 }}>
        {overlayNames.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              View <Box component="kbd">V</Box>
            </Typography>
            <ToggleButtonGroup
              size="small"
              value={overlayNames.filter((key) => overlays[key])}
              onChange={(_event, next: string[]) =>
                onOverlays({ lidar: next.includes('lidar'), radar: next.includes('radar') })
              }
              aria-label="sensor overlays"
            >
              {overlayNames.map((key) => (
                <ToggleButton key={key} value={key} aria-label={`show ${key}`}>
                  {key === 'lidar' ? 'LiDAR' : 'Radar'}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Stack>
        )}
        {canMask && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: 190 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Mask
            </Typography>
            <Slider
              size="small"
              min={0.1}
              max={1}
              step={0.05}
              value={maskOpacity}
              onChange={(_event, value) => onMaskOpacity(value as number)}
              aria-label="mask opacity"
            />
          </Stack>
        )}
        {painting && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: 220 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
              Brush <Box component="kbd">[</Box> <Box component="kbd">]</Box>
            </Typography>
            <Slider
              size="small"
              min={2}
              max={200}
              value={brushDiameter}
              onChange={(_event, value) => onBrushDiameter(value as number)}
              aria-label="brush size"
            />
          </Stack>
        )}
      </Stack>
    </Stack>
  );
};

export default EditorToolbar;
