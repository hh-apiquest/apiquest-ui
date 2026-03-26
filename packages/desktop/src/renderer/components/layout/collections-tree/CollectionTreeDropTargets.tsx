import type { ReactElement } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { getDropIndicatorStyle } from './dropIndicators';
import type { TreeDragItem, TreeDropPreview, TreeDropTarget } from './types';

type DropTargetZonesProps = {
  activeDragItem: TreeDragItem | null;
  dropPreview: TreeDropPreview;
  zones: TreeDropTarget[];
};

type DropTargetZoneProps = {
  zone: TreeDropTarget;
  dropPreview: TreeDropPreview;
};

export function DropTargetZones({ activeDragItem, dropPreview, zones }: DropTargetZonesProps): ReactElement | null {
  if (activeDragItem === null) {
    return null;
  }

  return (
    <>
      {zones.map((zone) => (
        <DropTargetZone key={zone.zoneId} zone={zone} dropPreview={dropPreview} />
      ))}
    </>
  );
}

function DropTargetZone({ zone, dropPreview }: DropTargetZoneProps): ReactElement {
  const { setNodeRef } = useDroppable({
    id: zone.zoneId,
    data: { dropTarget: zone },
  });

  const isOver = dropPreview.overZoneId === zone.zoneId;
  const style = getDropIndicatorStyle(isOver, dropPreview.isValid, zone.position);

  if (zone.position === 'before') {
    return <div ref={setNodeRef} style={{ position: 'absolute', left: 0, right: 0, top: -2, height: 6, zIndex: 3, ...style }} />;
  }

  if (zone.position === 'after') {
    return <div ref={setNodeRef} style={{ position: 'absolute', left: 0, right: 0, bottom: -2, height: 6, zIndex: 3, ...style }} />;
  }

  return <div ref={setNodeRef} style={{ position: 'absolute', inset: 0, zIndex: 2, ...style }} />;
}
