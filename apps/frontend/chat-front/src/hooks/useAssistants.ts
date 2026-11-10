import { useEffect, useState } from 'react';
import { assistantService } from '../services/assistantService';
import type { PublicAssistant, Assistant } from '../types/assistant';
const empty = { name: '', personality: '', paused: false };

export function useAssistants() {
  const [catalog, setCatalog] = useState<PublicAssistant[]>([]);
  const [rows, setRows] = useState<Assistant[]>([]);
  const [editing, setEditing] = useState<string>();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void assistantService
      .catalog(controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setCatalog(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {});
    void assistantService
      .list(controller.signal)
      .then(setRows)
      .catch((cause: Error) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, []);
  const change = async (operation: () => Promise<unknown>) => {
    setSaving(true);
    setError('');
    try {
      await operation();
      setRows(await assistantService.list());
      setEditing(undefined);
      setForm(empty);
      setConfirmDelete(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save assistant');
    } finally {
      setSaving(false);
    }
  };
  const save = () => change(() => assistantService.save(form, editing));
  const remove = (id: string) => change(() => assistantService.remove(id));
  /** Starts new analyses with this assistant, or goes back to the built-in analyst. Its other settings are kept. */
  const makeDefault = (row: Assistant, on: boolean) =>
    change(() =>
      assistantService.save({ name: row.name, personality: row.personality, paused: row.paused, default: on }, row._id)
    );

  return {
    catalog,
    rows,
    editing,
    setEditing,
    form,
    setForm,
    error,
    saving,
    confirmDelete,
    setConfirmDelete,
    empty,
    save,
    remove,
    makeDefault
  };
}
