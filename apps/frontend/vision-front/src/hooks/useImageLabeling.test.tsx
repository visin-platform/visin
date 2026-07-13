import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const navigateMock = vi.fn();
let paramsMock: { imageId?: string } = {};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => paramsMock
  };
});

vi.mock('../services/datasetImageService', () => ({
  getAllImages: vi.fn(),
  updateDatasetImage: vi.fn(),
  getLabelingStats: vi.fn()
}));

import { getAllImages, updateDatasetImage, getLabelingStats } from '../services/datasetImageService';
import { useImageLabeling } from './useImageLabeling';

const mockedGetAll = vi.mocked(getAllImages);
const mockedUpdate = vi.mocked(updateDatasetImage);
const mockedStats = vi.mocked(getLabelingStats);

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const makeImage = (id: string, tags: string[] = []) => ({ _id: id, tags } as any);

describe('useImageLabeling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paramsMock = {};
    mockedStats.mockResolvedValue({
      total: 10,
      good: 2,
      bad: 1,
      unlabeled: 7,
      goodPercentage: 20,
      badPercentage: 10,
      unlabeledPercentage: 70
    });
  });

  it('loads labeling metrics on mount', async () => {
    const { result } = renderHook(() => useImageLabeling(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.metricsLoading).toBe(false));
    expect(result.current.labelingMetrics?.total).toBe(10);
  });

  it('startLabeling requires a positive image limit', async () => {
    const { result } = renderHook(() => useImageLabeling(), { wrapper: makeWrapper() });

    act(() => {
      result.current.setImageLimit(0);
    });

    await act(async () => {
      await result.current.startLabeling();
    });

    expect(result.current.alert).toEqual({ type: 'error', message: 'Please enter a number greater than 0' });
    expect(mockedGetAll).not.toHaveBeenCalled();
  });

  it('startLabeling navigates to the first unlabeled image', async () => {
    mockedGetAll.mockResolvedValue({
      success: true,
      data: { images: [makeImage('img1'), makeImage('img2', ['good'])], pagination: {} as any }
    });
    const { result } = renderHook(() => useImageLabeling(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.startLabeling();
    });

    expect(navigateMock).toHaveBeenCalledWith('/image-labeling/img1', { replace: true });
    expect(result.current.images).toHaveLength(1);
    expect(result.current.setupMode).toBe(false);
  });

  it('startLabeling shows an info alert and resets setupMode when no unlabeled images exist', async () => {
    mockedGetAll.mockResolvedValue({
      success: true,
      data: { images: [makeImage('img1', ['good'])], pagination: {} as any }
    });
    const { result } = renderHook(() => useImageLabeling(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.startLabeling();
    });

    expect(result.current.setupMode).toBe(true);
    expect(result.current.alert?.type).toBe('info');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('startLabeling shows an error alert when the fetch fails', async () => {
    mockedGetAll.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useImageLabeling(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.startLabeling();
    });

    expect(result.current.alert?.type).toBe('error');
    expect(result.current.setupMode).toBe(true);
  });

  it('handleLabel saves the label, updates state, and advances to the next image', async () => {
    mockedGetAll.mockResolvedValue({
      success: true,
      data: { images: [makeImage('img1'), makeImage('img2')], pagination: {} as any }
    });
    mockedUpdate.mockResolvedValue({} as any);
    const { result } = renderHook(() => useImageLabeling(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.startLabeling();
    });

    await act(async () => {
      await result.current.handleLabel('good');
    });

    expect(mockedUpdate).toHaveBeenCalledWith('img1', { tags: ['good'] });
    expect(result.current.sessionLabels['img1']).toBe('good');
    expect(result.current.currentImageIndex).toBe(1);
    expect(navigateMock).toHaveBeenCalledWith('/image-labeling/img2', { replace: true });
  });

  it('handleLabel shows an error alert when the update fails', async () => {
    mockedGetAll.mockResolvedValue({
      success: true,
      data: { images: [makeImage('img1')], pagination: {} as any }
    });
    mockedUpdate.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useImageLabeling(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.startLabeling();
    });

    await act(async () => {
      await result.current.handleLabel('bad');
    });

    expect(result.current.alert).toEqual({ type: 'error', message: 'Failed to save label' });
  });

  it('handleSkip records a skip and advances without saving', async () => {
    mockedGetAll.mockResolvedValue({
      success: true,
      data: { images: [makeImage('img1'), makeImage('img2')], pagination: {} as any }
    });
    const { result } = renderHook(() => useImageLabeling(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.startLabeling();
    });

    act(() => {
      result.current.handleSkip();
    });

    expect(result.current.sessionLabels['img1']).toBe('skip');
    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(result.current.currentImageIndex).toBe(1);
  });

  it('handlePrevious and handleNext move within bounds', async () => {
    mockedGetAll.mockResolvedValue({
      success: true,
      data: { images: [makeImage('img1'), makeImage('img2')], pagination: {} as any }
    });
    const { result } = renderHook(() => useImageLabeling(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.startLabeling();
    });

    act(() => {
      result.current.handlePrevious();
    });
    expect(result.current.currentImageIndex).toBe(0);

    act(() => {
      result.current.handleNext();
    });
    expect(result.current.currentImageIndex).toBe(1);

    act(() => {
      result.current.handleNext();
    });
    expect(result.current.currentImageIndex).toBe(1);
  });

  it('resetLabeling clears session state and navigates back to setup', async () => {
    mockedGetAll.mockResolvedValue({
      success: true,
      data: { images: [makeImage('img1')], pagination: {} as any }
    });
    const { result } = renderHook(() => useImageLabeling(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.startLabeling();
    });

    act(() => {
      result.current.resetLabeling();
    });

    expect(result.current.setupMode).toBe(true);
    expect(result.current.images).toEqual([]);
    expect(navigateMock).toHaveBeenCalledWith('/image-labeling', { replace: true });
  });
});
