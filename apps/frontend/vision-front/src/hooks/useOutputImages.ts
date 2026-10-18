import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chartSeries, useChartColors } from '@visin/frontend-core';
import { visualizationService } from '../services/visualizationService';
import { trainingService } from '../services/trainingService';
import { outputClassesOf } from '../providers/visin';
import { useTaxonomy } from '../taxonomy/useTaxonomy';
import type { Visualization, VisualizationsPaginatedResponse } from '../types';
import type { OutputClass } from '../utils/outputPixels';

/** Most images one training shows for one type at a time. */
export const GALLERY_LIMIT = 200;
/** One training's images of one type, with their signed URLs: shared by every gallery that shows them. */
export const typeGalleryQuery = (trainingUuid: string, type: string) => ({
  queryKey: ['visualizations', trainingUuid, type],
  queryFn: async () =>
    ((await visualizationService.getVisualizationsByTraining(trainingUuid, {
      type,
      limit: GALLERY_LIMIT,
      includeUrls: true
    })) as VisualizationsPaginatedResponse).data
});

/** One kind of a run's outputs at one epoch, so a page of them is not spent on the run's other epochs. */
export const epochOutputsQuery = (trainingUuid: string, type: string, epoch: number | undefined) => ({
  queryKey: ['visualizations', trainingUuid, type, 'epoch', epoch],
  queryFn: async () =>
    ((await visualizationService.getVisualizationsByTraining(trainingUuid, {
      type,
      epoch,
      limit: GALLERY_LIMIT,
      includeUrls: true
    })) as VisualizationsPaginatedResponse).data,
  enabled: epoch !== undefined
});

/** How long before its expiry a signed URL is no longer trusted to last the request. */
const URL_MARGIN_MS = 5_000;

/**
 * A signed URL for the image that will still be good when the request lands. The ones a listing hands out last a
 * minute, and a gallery is looked at for longer: a frame opened later asks for its own.
 */
export const freshImageUrl = async (
  visualization: Pick<Visualization, 'visualization_uuid' | 'signedUrl' | 'urlExpiresAt'>,
  force = false
): Promise<string> => {
  const expires = visualization.urlExpiresAt ? Date.parse(visualization.urlExpiresAt) : NaN;
  if (!force && visualization.signedUrl && !(expires - Date.now() < URL_MARGIN_MS)) return visualization.signedUrl;
  const fresh = (await visualizationService.getVisualizationByUuid(visualization.visualization_uuid)).data.signedUrl;
  if (!fresh) throw new Error('The image has no download link');
  return fresh;
};

/**
 * Whether `ref` is on screen or close to it, so a long gallery decodes only the frames someone can see. True from the
 * start where the browser cannot tell.
 */
export const useNearViewport = (ref: RefObject<Element | null>, margin = '400px'): boolean => {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (near || !element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: margin }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, near, margin]);
  return near;
};

/** The classes a run's masks index, from the weights it stored. */
export const useRunClasses = (trainingId: string | undefined, epoch?: number): OutputClass[] => {
  const { data } = useQuery({
    queryKey: ['training-models', trainingId],
    queryFn: async () => (await trainingService.getTrainingById(trainingId!)).data.models ?? [],
    enabled: Boolean(trainingId),
    staleTime: 60_000
  });
  return useMemo(() => outputClassesOf(data, epoch), [data, epoch]);
};

const NO_CLASSES: OutputClass[] = [];

/**
 * The colour of each mask class: the project's colour for a class it names, else the chart series slot of its index,
 * so a mask, its legend and the class charts agree. Stable while the scheme and classes are, so a painted canvas is
 * not repainted on every render.
 */
export const useClassColours = (classes: OutputClass[] = NO_CLASSES) => {
  const { series } = useChartColors();
  const taxonomy = useTaxonomy();
  return useCallback(
    (index: number): string => {
      const name = classes.find((entry) => entry.index === index)?.name;
      const term = name ? taxonomy.classes.find((entry) => entry.key === name) : undefined;
      if (!term) return series[index % series.length];
      // A stored series colour draws as the showing scheme's step, as `useChartColors().adapt` does.
      const slot = (chartSeries.light as readonly string[]).indexOf(term.color.toLowerCase());
      return slot === -1 ? term.color : series[slot];
    },
    [classes, taxonomy, series]
  );
};
