import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';

const service = vi.hoisted(() => ({ document: vi.fn(), pdf: vi.fn(), refreshDocument: vi.fn() }));
vi.mock('../../services/paperService', () => ({ paperService: service }));

import PaperReader from './PaperReader';
import { renderWithClient } from '../../test/renderWithClient';

const mount = (props: Partial<React.ComponentProps<typeof PaperReader>> = {}) =>
  renderWithClient(
    <PaperReader
      paperId="pa1"
      title="Night segmentation"
      canManage={false}
      sourceUrl="https://example.test/p.pdf"
      {...props}
    />
  );

beforeEach(() => {
  vi.resetAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:pdf-1');
  URL.revokeObjectURL = vi.fn();
});

describe('PaperReader', () => {
  it('shows the stored PDF in place, with a way to open it full screen and to keep it', async () => {
    service.document.mockResolvedValue({ status: 'ready', viewable: true, pageCount: 12 });
    service.pdf.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
    mount();

    const frame = await screen.findByTitle('PDF of Night segmentation');
    expect(frame).toHaveAttribute('src', 'blob:pdf-1#view=FitH');
    expect(screen.getByText('12 pages')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Full screen/ })).toHaveAttribute('href', 'blob:pdf-1');
    expect(screen.getByRole('link', { name: /Download/ })).toHaveAttribute('download', 'Night segmentation.pdf');
    expect(screen.queryByRole('button', { name: /Read again/ })).not.toBeInTheDocument();
  });

  it('says it is reading while the PDF is not ready, and shows it once it is', async () => {
    service.document.mockResolvedValueOnce({ status: 'pending', viewable: false });
    service.document.mockResolvedValue({ status: 'ready', viewable: true, pageCount: 3 });
    service.pdf.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
    mount();

    expect(await screen.findByRole('status', { name: /Reading the paper/ })).toBeInTheDocument();
    expect(await screen.findByTitle('PDF of Night segmentation', {}, { timeout: 6000 })).toBeInTheDocument();
  }, 10000);

  it('says why it could not be shown, links to the original, and lets only a manager try again', async () => {
    service.document.mockResolvedValue({
      status: 'failed',
      viewable: false,
      error: 'That address did not return a PDF'
    });
    const view = mount();

    expect(await screen.findByText(/could not be shown here: That address did not return a PDF/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the original/ })).toHaveAttribute(
      'href',
      'https://example.test/p.pdf'
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByText(/owner can fix its PDF address/)).toBeInTheDocument();
    view.unmount();

    service.refreshDocument.mockResolvedValue({ status: 'pending', viewable: false });
    mount({ canManage: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(service.refreshDocument).toHaveBeenCalledWith('pa1'));
  });

  it('lets a manager read the PDF again', async () => {
    service.document.mockResolvedValue({ status: 'ready', viewable: true, pageCount: 2 });
    service.pdf.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
    service.refreshDocument.mockResolvedValue({ status: 'pending', viewable: false });
    mount({ canManage: true });

    await userEvent.click(await screen.findByRole('button', { name: /Read again/ }));
    await waitFor(() => expect(service.refreshDocument).toHaveBeenCalledWith('pa1'));
  });

  it('loads the replacement PDF even when its page count stays the same', async () => {
    service.document.mockResolvedValue({ status: 'ready', viewable: true, pageCount: 2 });
    service.pdf.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
    service.refreshDocument.mockResolvedValue({ status: 'pending', viewable: false });
    mount({ canManage: true });

    await screen.findByTitle('PDF of Night segmentation');
    await userEvent.click(screen.getByRole('button', { name: /Read again/ }));
    await waitFor(() => expect(service.pdf).toHaveBeenCalledTimes(2), { timeout: 6000 });
  }, 10000);

  it('lets the user retry when the document status cannot be loaded', async () => {
    service.document.mockRejectedValueOnce(new Error('offline'));
    service.document.mockResolvedValue({ status: 'none', viewable: false });
    mount();

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(service.document).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/Could not load the PDF status/)).not.toBeInTheDocument());
  });

  it('shows nothing for a paper with no PDF address', async () => {
    service.document.mockResolvedValue({ status: 'none', viewable: false });
    const { container } = mount();
    await waitFor(() => expect(service.document).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector('iframe')).toBeNull());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('offers the original when the stored copy cannot be loaded, and gives its blob address back', async () => {
    service.document.mockResolvedValue({ status: 'ready', viewable: true, pageCount: 2 });
    service.pdf.mockRejectedValue(new Error('down'));
    mount();
    expect(await screen.findByText(/Could not load the PDF/, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open the original/ })).toBeInTheDocument();
  });

  it('releases the blob address when it is left', async () => {
    service.document.mockResolvedValue({ status: 'ready', viewable: true, pageCount: 2 });
    service.pdf.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
    const view = mount();
    await screen.findByTitle('PDF of Night segmentation');
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pdf-1');
  });
});
