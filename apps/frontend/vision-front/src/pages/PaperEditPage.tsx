import React, { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Container, Divider, TextField, Typography } from '@mui/material';
import { Article as ArticleIcon, UploadFile as UploadFileIcon } from '@mui/icons-material';
import { EmptyState, OwnerPicker, PageHeader, VisibilitySwitch, type OwnerRef } from '@visin/frontend-core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AuthorsEditor from '../components/papers/AuthorsEditor';
import { newAuthorDraft, type AuthorDraft } from '../components/papers/authorDraft';
import ResultsEditor, { type ResultDraft } from '../components/papers/ResultsEditor';
import TagInput from '../components/TagInput';
import { useAuth } from '../contexts/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { usePaperDocument } from '../hooks/usePaperDocument';
import { useProjectGroups } from '../hooks/useProjectGroups';
import { paperService } from '../services/paperService';
import type { CreatePaperInput, Paper, PaperVisibility } from '../types/paper';

interface FormState {
  title: string;
  abstract: string;
  authors: AuthorDraft[];
  venue: string;
  year: string;
  arxivId: string;
  doi: string;
  url: string;
  pdfUrl: string;
  tags: string[];
  results: ResultDraft[];
  visibility: PaperVisibility;
}

const blank = (): FormState => ({
  title: '',
  abstract: '',
  authors: [newAuthorDraft()],
  venue: '',
  year: '',
  arxivId: '',
  doi: '',
  url: '',
  pdfUrl: '',
  tags: [],
  results: [],
  visibility: 'private'
});

const fromPaper = (paper: Paper): FormState => ({
  title: paper.title,
  abstract: paper.abstract ?? '',
  authors: paper.authors.map((author) =>
    newAuthorDraft({
      name: author.name,
      status: author.status,
      person: author.user
        ? {
            id: author.user.id,
            handle: author.user.handle ?? '',
            name: author.user.name ?? author.name,
            picture: author.user.picture
          }
        : undefined
    })
  ),
  venue: paper.venue ?? '',
  year: paper.year ? String(paper.year) : '',
  arxivId: paper.arxivId ?? '',
  doi: paper.doi ?? '',
  url: paper.url ?? '',
  pdfUrl: paper.pdfUrl ?? '',
  tags: paper.tags,
  results: paper.results.flatMap((result) =>
    result.ref
      ? [
          {
            kind: result.kind,
            ref: result.ref,
            note: result.note ?? '',
            name: result.name,
            available: result.available
          }
        ]
      : []
  ),
  visibility: paper.visibility
});

const YEAR = /^\d{4}$/;
/** What the server accepts as an uploaded PDF (see vision-service `MAX_UPLOAD_BYTES`). */
const MAX_PDF_BYTES = 30 * 1024 * 1024;

/** Why a chosen file cannot be uploaded, or undefined when it can. */
const pdfProblem = (file: File): string | undefined => {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return 'Choose a PDF file.';
  if (file.size > MAX_PDF_BYTES) return 'The PDF is larger than 30 MB.';
  return undefined;
};

/** What the form says, as the API wants it. Returns the problem instead when a field cannot be sent. */
function toPayload(form: FormState): { error: string } | { fields: Omit<CreatePaperInput, 'owner'> } {
  if (!form.title.trim()) return { error: 'A title is required.' };
  const authors = form.authors.filter((author) => author.name.trim());
  if (authors.length === 0) return { error: 'A paper needs at least one author.' };
  if (form.year.trim() && !YEAR.test(form.year.trim())) return { error: 'The year should be four digits, like 2025.' };
  const text = (value: string) => value.trim() || undefined;
  return {
    fields: {
      title: form.title.trim(),
      abstract: text(form.abstract),
      authors: authors.map((author) => ({
        name: author.name.trim(),
        ...(author.person ? { userId: author.person.id } : {})
      })),
      venue: text(form.venue),
      year: form.year.trim() ? Number(form.year.trim()) : undefined,
      arxivId: text(form.arxivId),
      doi: text(form.doi),
      url: text(form.url),
      pdfUrl: text(form.pdfUrl),
      tags: form.tags,
      results: form.results.map((result) => ({
        kind: result.kind,
        ref: result.ref,
        ...(result.note.trim() ? { note: result.note.trim() } : {})
      })),
      visibility: form.visibility
    }
  };
}

/** Adds a paper, or changes one. The same form for both; only who owns it is chosen once, when it is made. */
const PaperEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const editing = id !== undefined;
  usePageTitle(editing ? 'Edit paper' : 'Add paper');
  const { user, isAuthenticated, isLoading: authLoading, login } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const groups = useProjectGroups(isAuthenticated);
  const existing = useQuery({
    queryKey: ['papers', 'one', id, user?.id],
    queryFn: () => paperService.get(id!),
    enabled: editing && isAuthenticated,
    retry: false
  });
  const [form, setForm] = useState<FormState>(blank);
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const [owner, setOwner] = useState<OwnerRef | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** a PDF chosen to upload once the paper is saved */
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  /** the paper a first save made, when its PDF then failed to upload: a retry changes it instead of adding another */
  const [createdId, setCreatedId] = useState<string | null>(null);
  const savedId = id ?? createdId;
  const storedPdf = usePaperDocument(savedId ?? '');

  // The form starts from the saved paper once, and is never overwritten by a refetch of what it is editing.
  useEffect(() => {
    if (existing.data && loadedFrom !== existing.data.id) {
      setForm(fromPaper(existing.data));
      setLoadedFrom(existing.data.id);
    }
  }, [existing.data, loadedFrom]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const payload = toPayload(form);
      if ('error' in payload) throw new Error(payload.error);
      const { fields } = payload;
      // A public paper needs a way to it, and an uploaded file only counts once it is stored: so the paper is saved
      // private first and made public after the upload, when the file is all it has.
      const wasPublic = existing.data?.visibility === 'public';
      const deferPublic =
        pdfFile !== null && fields.visibility === 'public' && !wasPublic && !fields.arxivId && !fields.doi && !fields.url;
      let paper: Paper;
      if (savedId) {
        // `null` clears a field the person emptied; what the update leaves out it leaves alone.
        paper = await paperService.update(savedId, {
          ...fields,
          abstract: fields.abstract ?? null,
          venue: fields.venue ?? null,
          year: fields.year ?? null,
          arxivId: fields.arxivId ?? null,
          doi: fields.doi ?? null,
          url: fields.url ?? null,
          pdfUrl: fields.pdfUrl ?? null,
          // Only an owner may change who sees it; leaving it out keeps the paper as it is.
          visibility: editing && !existing.data?.permissions?.own ? undefined : deferPublic ? 'private' : fields.visibility
        });
      } else {
        paper = await paperService.create({
          ...fields,
          visibility: deferPublic ? 'private' : fields.visibility,
          owner: owner ?? { kind: 'user', id: user!.id }
        });
        setCreatedId(paper.id);
      }
      if (pdfFile) {
        try {
          await paperService.uploadPdf(paper.id, pdfFile);
        } catch (error) {
          throw new Error(
            `The paper was saved, but its PDF was not uploaded: ${error instanceof Error ? error.message : 'try again'}`
          );
        }
        // Stored: a second save, after a later step failed, does not send the file again.
        setPdfFile(null);
        if (deferPublic) {
          try {
            paper = await paperService.update(paper.id, { visibility: 'public' });
          } catch (error) {
            throw new Error(
              `The paper and its PDF were saved as a private draft, but it could not be made public: ${
                error instanceof Error ? error.message : 'try again'
              }`
            );
          }
        }
      }
      return paper;
    },
    onSuccess: async (paper) => {
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      navigate(`/papers/${paper.id}`);
    },
    onError: async (error) => {
      setProblem(error instanceof Error ? error.message : 'Could not save the paper');
      // Part of the save may have gone through (the paper, its file): what the page shows is fetched again.
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
    }
  });

  const removePdf = useMutation({
    mutationFn: () => paperService.removeUploadedPdf(savedId!),
    onMutate: () => setProblem(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['papers'] }),
    onError: (error) => setProblem(error instanceof Error ? error.message : 'Could not remove the PDF')
  });

  const choosePdf = (file: File | undefined) => {
    if (!file) return;
    const refusal = pdfProblem(file);
    setProblem(refusal ?? null);
    setPdfFile(refusal ? null : file);
  };

  if (authLoading || (editing && isAuthenticated && existing.isLoading)) return <CircularProgress />;
  if (!isAuthenticated || !user) {
    return (
      <Container maxWidth="md">
        <EmptyState
          icon={<ArticleIcon />}
          title="Sign in to add a paper"
          description="Papers belong to an account or a group, so only signed-in people can add them."
          action={
            <Button variant="contained" onClick={login}>
              Sign in
            </Button>
          }
        />
      </Container>
    );
  }
  if (editing && (existing.isError || !existing.data || existing.data.permissions?.manage !== true)) {
    return (
      <Container maxWidth="md">
        <EmptyState
          icon={<ArticleIcon />}
          title={existing.isError || !existing.data ? 'Paper not found' : 'You cannot edit this paper'}
          action={
            <Button component={RouterLink} to="/papers">
              All papers
            </Button>
          }
        />
      </Container>
    );
  }

  const ownerRef: OwnerRef = owner ?? { kind: 'user', id: user.id };
  const canShare = editing
    ? existing.data?.permissions?.own === true
    : ownerRef.kind === 'user' || groups.data?.find((group) => group.id === ownerRef.id)?.role === 'owner';
  const busy = save.isPending || removePdf.isPending;
  const uploaded = storedPdf.data?.uploaded === true;

  return (
    <Container maxWidth="md" sx={{ pb: 4 }}>
      <PageHeader
        title={editing ? 'Edit paper' : 'Add a paper'}
        subtitle="Where the paper lives, who wrote it, and which results on Visin it rests on."
      />
      <Box
        component="form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setProblem(null);
          save.mutate();
        }}
        sx={{ display: 'grid', gap: 3 }}
      >
        {problem && <Alert severity="error">{problem}</Alert>}

        <TextField
          label="Title"
          required
          fullWidth
          value={form.title}
          disabled={busy}
          onChange={(event) => set('title', event.target.value)}
          slotProps={{ htmlInput: { maxLength: 300 } }}
        />
        <AuthorsEditor value={form.authors} onChange={(next) => set('authors', next)} user={user} disabled={busy} />
        <TextField
          label="Abstract"
          fullWidth
          multiline
          minRows={4}
          value={form.abstract}
          disabled={busy}
          onChange={(event) => set('abstract', event.target.value)}
          slotProps={{ htmlInput: { maxLength: 5000 } }}
        />

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' } }}>
          <TextField
            label="Venue"
            placeholder="CVPR 2025, or “preprint”"
            value={form.venue}
            disabled={busy}
            onChange={(event) => set('venue', event.target.value)}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <TextField
            label="Year"
            value={form.year}
            disabled={busy}
            onChange={(event) => set('year', event.target.value)}
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 4 } }}
          />
        </Box>

        <Box sx={{ display: 'grid', gap: 2 }}>
          <Typography variant="subtitle2">Where to read it</Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <TextField
              label="arXiv"
              placeholder="2401.01234 or the arXiv address"
              value={form.arxivId}
              disabled={busy}
              onChange={(event) => set('arxivId', event.target.value)}
            />
            <TextField
              label="DOI"
              placeholder="10.1234/example"
              value={form.doi}
              disabled={busy}
              onChange={(event) => set('doi', event.target.value)}
            />
            <TextField
              label="Paper page"
              placeholder="https://…"
              value={form.url}
              disabled={busy}
              onChange={(event) => set('url', event.target.value)}
            />
            <TextField
              label="PDF"
              placeholder="https://…"
              value={form.pdfUrl}
              disabled={busy}
              onChange={(event) => set('pdfUrl', event.target.value)}
              helperText="An https address of the PDF. Visin keeps a copy to show on the paper’s page and to let the analyst search it. For an arXiv paper this can stay empty."
            />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button component="label" variant="outlined" startIcon={<UploadFileIcon />} disabled={busy}>
              {uploaded || pdfFile ? 'Choose another PDF' : 'Upload a PDF'}
              <input
                hidden
                type="file"
                accept="application/pdf,.pdf"
                aria-label="PDF file"
                onChange={(event) => {
                  choosePdf(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </Button>
            {pdfFile ? (
              <>
                <Typography variant="body2">{pdfFile.name} will be uploaded when you save.</Typography>
                <Button size="small" disabled={busy} onClick={() => setPdfFile(null)}>
                  Don’t upload
                </Button>
              </>
            ) : uploaded ? (
              <>
                <Typography variant="body2">
                  An uploaded PDF is stored{storedPdf.data?.pageCount ? ` (${storedPdf.data.pageCount} pages)` : ''}.
                </Typography>
                <Button size="small" color="error" disabled={busy} onClick={() => removePdf.mutate()}>
                  Remove it
                </Button>
              </>
            ) : null}
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: -1 }}>
            No link or identifier? Upload the paper’s PDF instead. It is kept by Visin, shown on the paper’s page and
            searchable by the analyst, and replaces a PDF address while it is there.
          </Typography>
        </Box>

        <TagInput
          tags={form.tags}
          onTagsChange={(next) => set('tags', next)}
          label="Tags"
          placeholder="segmentation, night driving…"
          maxTags={10}
        />
        <Divider />
        <ResultsEditor value={form.results} onChange={(next) => set('results', next)} disabled={busy} />
        <Divider />

        {!editing && (
          <OwnerPicker
            value={ownerRef}
            onChange={setOwner}
            userId={user.id}
            groups={groups.data ?? []}
            disabled={busy || groups.isLoading}
            helperText={groups.isError ? 'Could not load your groups' : undefined}
          />
        )}
        <Box>
          <VisibilitySwitch
            value={form.visibility}
            onChange={(next) => set('visibility', next)}
            canMakePublic={canShare}
            disabled={busy || (editing && !canShare)}
          />
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
            A public paper needs an arXiv id, a DOI, a link to the paper or an uploaded PDF, and at least one cited
            result that is public on Visin.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button component={RouterLink} to={editing ? `/papers/${id}` : '/papers'} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? <CircularProgress size={24} /> : editing ? 'Save' : 'Add paper'}
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default PaperEditPage;
