/** Stands in for the editor canvas: it exposes its props as attributes and lets a test click the segment tool. */
export type FakeCanvasProps = {
  tool: string;
  activeClass: { key: string } | null;
  readOnly: boolean;
  brushRadius: number;
  overlays: { lidar: boolean; radar: boolean };
  sam?: {
    points: unknown[];
    box: unknown;
    preview: { data: Uint8Array } | null;
    busy: boolean;
    onPrompt: (points: { x: number; y: number; label: 0 | 1 }[], box: [number, number, number, number] | null) => void;
  };
};

export const FakeCanvas = (props: FakeCanvasProps) => (
    <div
      data-testid="canvas"
      data-tool={props.tool}
      data-class={props.activeClass?.key ?? ''}
      data-readonly={String(props.readOnly)}
      data-radius={props.brushRadius}
      data-lidar={String(props.overlays.lidar)}
      data-radar={String(props.overlays.radar)}
      data-sam-points={props.sam ? props.sam.points.length : -1}
      data-sam-preview={props.sam?.preview ? props.sam.preview.data.filter((value) => value === 1).length : -1}
    >
      <button onClick={() => props.sam?.onPrompt([{ x: 3, y: 4, label: 1 }], null)}>fake-sam-click</button>
      <button onClick={() => props.sam?.onPrompt([], null)}>fake-sam-clear</button>
    </div>
  );
