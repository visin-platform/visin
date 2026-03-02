import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  Button,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Paper
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Code as CodeIcon, ContentCopy as ContentCopyIcon } from '@mui/icons-material';
import { formatTime, formatNumber } from '../utils/comparisonLatexGenerator';
import type { ComparisonEpoch } from '../types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { comparisonService } from '../services/comparisonService';
import { trainingService } from '../services/trainingService';
import { projectService } from '../services/projectService';
import { usePageTitle } from '../hooks/usePageTitle';
import ComparisonTable from '@/components/comparison/ComparisonTable';
import PerformanceMetricsTable from '../components/test-results/PerformanceMetricsTable';
import IoUMetricsTable from '../components/test-results/IoUMetricsTable';
import APMetricsTable from '../components/test-results/APMetricsTable';
import BenchmarksComparisonTable from '../components/comparison/BenchmarksComparisonTable';
import PageBreadcrumbs from '../components/common/PageBreadcrumbs';
import DeleteComparisonDialog from '../components/comparisons/DeleteComparisonDialog';
import TrainingSelector from '../components/comparison/TrainingSelector';
import NumberFormattingControls from '../components/common/NumberFormattingControls';
import TrainingClassIoUTable from '../components/comparison/TrainingClassIoUTable';
import TrainingValidationMetricsTable from '../components/comparison/TrainingValidationMetricsTable';

const ComparisonDetailPage: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Set page title
  usePageTitle('Comparison - Vision');

  // State for active tab
  const [activeTab, setActiveTab] = useState(0);

  // State for number formatting
  const [decimals, setDecimals] = useState(4);
  const [multiplier, setMultiplier] = useState(1);

  // State for edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSelectedIds, setEditSelectedIds] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);

  // State for delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // State for export all LaTeX dialog
  const [exportLatexOpen, setExportLatexOpen] = useState(false);
  const [exportLatexTab, setExportLatexTab] = useState(0);
  const [copiedSection, setCopiedSection] = useState<number | null>(null);

  // Fetch comparison by UUID
  const {
    data: comparisonResponse,
    isLoading: isComparisonLoading,
    error: comparisonError
  } = useQuery({
    queryKey: ['comparison', uuid],
    queryFn: () => comparisonService.getComparisonByUuid(uuid!),
    enabled: !!uuid
  });

  const comparison = comparisonResponse?.data;

  // Fetch trainings for the edit modal
  const { data: trainingsResponse, isLoading: isTrainingsLoading } = useQuery({
    queryKey: ['trainings-for-edit', comparison?.projectId],
    queryFn: () => trainingService.getTrainings({ projectId: comparison!.projectId!, limit: 1000 }),
    enabled: !!comparison?.projectId && editDialogOpen
  });

  const trainings = trainingsResponse?.data?.trainings || [];

  // Fetch project data if we have comparison
  const {
    data: projectResponse,
    isLoading: isProjectLoading
  } = useQuery({
    queryKey: ['project', comparison?.projectId],
    queryFn: () => projectService.getProjectById(comparison!.projectId!),
    enabled: !!comparison?.projectId
  });

  const project = projectResponse?.data;

  // Fetch training comparison data
  const {
    data: trainingComparisonResponse,
    isLoading: isTrainingComparisonLoading,
    error: trainingComparisonError
  } = useQuery({
    queryKey: ['trainingComparison', comparison?.itemIds],
    queryFn: () => trainingService.compareTrainings(comparison!.itemIds),
    enabled: !!comparison?.itemIds && comparison.itemIds.length > 0
  });

  const comparisonData = trainingComparisonResponse?.data?.comparison || [];

  // Handler functions
  const handleEditComparison = async () => {
    if (!comparison) return;

    setEditName(comparison.name);
    setEditDescription(comparison.description || '');
    setEditSelectedIds(comparison.itemIds);
    setEditDialogOpen(true);
  };

  const handleCancelEdit = () => {
    setEditDialogOpen(false);
    setEditName('');
    setEditDescription('');
    setEditSelectedIds([]);
  };

  const handleUpdateComparison = async () => {
    if (!comparison || !editName.trim()) return;

    try {
      setUpdating(true);
      await comparisonService.updateComparison(comparison._id, {
        name: editName.trim(),
        description: editDescription.trim(),
        itemIds: editSelectedIds,
      });

      // Invalidate and refetch the comparison data
      queryClient.invalidateQueries({ queryKey: ['comparison', uuid] });
      
      setEditDialogOpen(false);
      setEditName('');
      setEditDescription('');
      setEditSelectedIds([]);
    } catch (error) {
      console.error('Error updating comparison:', error);
    } finally {
      setUpdating(false);
    }
  };

  const handleEditTrainingIdToggle = (trainingId: string) => {
    setEditSelectedIds(prev =>
      prev.includes(trainingId)
        ? prev.filter(id => id !== trainingId)
        : [...prev, trainingId]
    );
  };

  const handleDeleteComparison = () => {
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!comparison) return;

    try {
      await comparisonService.deleteComparison(comparison._id);
      // Navigate back to project or comparisons page
      if (project) {
        navigate(`/projects/${project.slug || project._id}`);
      } else {
        navigate('/comparisons');
      }
    } catch (error) {
      console.error('Error deleting comparison:', error);
    }
  };

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false);
  };

  // Helper function to format dates as DD.MM.YYYY
  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
  };

  // Process test results data - use the already aggregated data from backend
  const testResultsData = React.useMemo(() => {
    if (!comparisonData.length) return [];

    return comparisonData
      .filter(comp => comp.aggregatedTestResults !== null)
      .map(comp => ({
        aggregatedResults: comp.aggregatedTestResults,
        training: comp.training,
        testResultsCount: comp.testResultsCount || 0
      }));
  }, [comparisonData]);

  // Process benchmarks data
  const benchmarksData = React.useMemo(() => {
    if (!comparisonData.length) return [];

    const allBenchmarks = comparisonData.flatMap(comp =>
      comp.benchmarks.map((benchmark: any) => ({
        ...benchmark,
        training_name: comp.training.name
      }))
    );

    return allBenchmarks;
  }, [comparisonData]);

  // ── Export-all LaTeX generators ──────────────────────────────

  const trainingLatex = React.useMemo(() => {
    if (!comparisonData.length) return '';
    const d = decimals;
    const m = multiplier;
    let out = '';

    // 1. Detailed training comparison table
    const sorted = [...comparisonData].sort((a, b) => {
      const avg = (comp: typeof a) => {
        const vals = comp.epochs
          .map((e: ComparisonEpoch) => e.results?.val?.mean_iou)
          .filter((v: number | undefined) => v !== undefined) as number[];
        vals.sort((x, y) => y - x);
        const top = vals.slice(0, 10);
        return top.length ? top.reduce((s, v) => s + v, 0) / top.length : -Infinity;
      };
      return avg(b) - avg(a);
    });

    let tbl = `\\begin{table*}[t]\n\\centering\n\\caption{Detailed Training Comparison}\n\\label{tab:detailed_comparison}\n\\begin{tabular}{|l|c|c|c|c|c|}\n\\hline\n`;
    tbl += 'Training & Total Time & Avg Epoch Time & Best Epoch & Best Val mIoU & Top 10 Val mIoU Avg \\\\\n\\hline\n';
    sorted.forEach(comp => {
      const name = comp.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
      tbl += `${name} `;
      tbl += `& ${formatTime(comp.metrics.totalTime)} `;
      tbl += `& ${formatTime(comp.metrics.avgEpochTime)} `;
      const bestEp = comp.epochs.length
        ? comp.epochs.reduce((best: ComparisonEpoch, ep: ComparisonEpoch) =>
            (ep.results?.val?.mean_iou ?? -Infinity) > (best.results?.val?.mean_iou ?? -Infinity) ? ep : best
          , comp.epochs[0])
        : null;
      tbl += `& ${bestEp ? bestEp.epoch : 'N/A'} `;
      const bestMiou = Math.max(...comp.epochs.map((e: ComparisonEpoch) => e.results?.val?.mean_iou ?? -Infinity));
      tbl += `& ${bestMiou !== -Infinity ? formatNumber(bestMiou, d, m) : 'N/A'} `;
      const vmIoUs = (comp.epochs.map((e: ComparisonEpoch) => e.results?.val?.mean_iou).filter((v: number | undefined) => v !== undefined) as number[])
        .sort((a2, b2) => b2 - a2).slice(0, 10);
      if (!vmIoUs.length) {
        tbl += '& N/A ';
      } else {
        const mean = vmIoUs.reduce((s, v) => s + v, 0) / vmIoUs.length;
        const std = Math.sqrt(vmIoUs.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vmIoUs.length);
        tbl += `& ${formatNumber(mean, d, m)} \\pm ${formatNumber(std, d, m)} `;
      }
      tbl += '\\\\ \\hline\n';
    });
    tbl += '\\end{tabular}\n\\end{table*}\n';
    out += tbl + '\n';

    // 2. Class IoU table
    const classMap: { [cls: string]: { [tid: string]: number[] } } = {};
    comparisonData.forEach(comp => {
      const tid = comp.training._id;
      const top10 = comp.epochs
        .filter((e: ComparisonEpoch) => e.results?.val?.mean_iou !== undefined)
        .sort((a2: ComparisonEpoch, b2: ComparisonEpoch) => (b2.results?.val?.mean_iou ?? 0) - (a2.results?.val?.mean_iou ?? 0))
        .slice(0, 10);
      top10.forEach((ep: ComparisonEpoch) => {
        const val = ep.results?.val;
        if (val) Object.keys(val).forEach(k => {
          if (k !== 'loss' && k !== 'mean_iou' && k !== 'val_loss') {
            const cd = val[k];
            if (cd && typeof cd === 'object' && typeof cd.iou === 'number') {
              if (!classMap[k]) classMap[k] = {};
              if (!classMap[k][tid]) classMap[k][tid] = [];
              classMap[k][tid].push(cd.iou);
            }
          }
        });
      });
    });
    const classNames = Object.keys(classMap).sort();
    if (classNames.length) {
      const classStats = classNames.map(cls => {
        const tStats: { [tid: string]: { mean: number; std: number } | null } = {};
        comparisonData.forEach(comp => {
          const vals = classMap[cls][comp.training._id];
          if (vals?.length) {
            const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
            const std = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length);
            tStats[comp.training._id] = { mean, std };
          } else tStats[comp.training._id] = null;
        });
        return { cls, tStats };
      });
      const bestPerClass: { [cls: string]: number } = {};
      classStats.forEach(({ cls, tStats }) => {
        bestPerClass[cls] = Math.max(...Object.values(tStats).map(s => s?.mean ?? -Infinity));
      });

      let iouTbl = `\\begin{table*}[t]\n\\centering\n\\caption{Training Validation IoU per Class (Top 10 Epochs by mIoU)}\n\\label{tab:class_iou}\n\\begin{tabular}{|l|${'c|'.repeat(classNames.length)}}\n\\hline\n`;
      iouTbl += 'Training ' + classStats.map(({ cls }) => `& ${cls.replace(/[&%$#_{}~^\\]/g, '\\$&')} `).join('') + '\\\\ \\hline\n';
      comparisonData.forEach(comp => {
        const name = comp.training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
        iouTbl += `${name} `;
        classStats.forEach(({ cls, tStats }) => {
          const s = tStats[comp.training._id];
          if (s) {
            const bold = s.mean === bestPerClass[cls];
            const bs = bold ? '\\textbf{' : '', be = bold ? '}' : '';
            iouTbl += `& ${bs}${(s.mean * m).toFixed(d)} \\pm ${(s.std * m).toFixed(d)}${be} `;
          } else iouTbl += '& N/A ';
        });
        iouTbl += '\\\\ \\hline\n';
      });
      iouTbl += '\\end{tabular}\n\\end{table*}\n';
      out += iouTbl + '\n';
    }

    // 3. Validation metrics table
    type VM = { mean: number; std: number };
    const vmData = comparisonData.map(comp => {
      const top10 = comp.epochs
        .filter((e: ComparisonEpoch) => e.results?.val?.mean_iou !== undefined)
        .sort((a2: ComparisonEpoch, b2: ComparisonEpoch) => (b2.results?.val?.mean_iou ?? 0) - (a2.results?.val?.mean_iou ?? 0))
        .slice(0, 10);
      if (!top10.length) return { training: comp.training, metrics: null };
      const stat = (vals: number[]): VM => {
        const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
        return { mean, std: Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length) };
      };
      const iouVals = top10.map((e: ComparisonEpoch) => e.results?.val?.mean_iou).filter((v: number | undefined) => v !== undefined) as number[];
      const ep: { p: number[], r: number[], f: number[] } = { p: [], r: [], f: [] };
      top10.forEach((e: ComparisonEpoch) => {
        const val = e.results?.val;
        if (!val) return;
        const cls = Object.keys(val).filter(k => k !== 'loss' && k !== 'mean_iou' && k !== 'val_loss');
        const ps: number[] = [], rs: number[] = [], fs: number[] = [];
        cls.forEach(k => {
          const cd = val[k];
          if (cd && typeof cd === 'object') {
            if (typeof cd.precision === 'number') ps.push(cd.precision);
            if (typeof cd.recall === 'number') rs.push(cd.recall);
            const f1 = cd.f1_score ?? cd.f1;
            if (typeof f1 === 'number') fs.push(f1);
          }
        });
        if (ps.length) ep.p.push(ps.reduce((s, v) => s + v, 0) / ps.length);
        if (rs.length) ep.r.push(rs.reduce((s, v) => s + v, 0) / rs.length);
        if (fs.length) ep.f.push(fs.reduce((s, v) => s + v, 0) / fs.length);
      });
      return {
        training: comp.training,
        metrics: {
          iou: iouVals.length ? stat(iouVals) : undefined,
          precision: ep.p.length ? stat(ep.p) : undefined,
          recall: ep.r.length ? stat(ep.r) : undefined,
          f1: ep.f.length ? stat(ep.f) : undefined,
        }
      };
    }).filter(x => x.metrics !== null);
    if (vmData.length) {
      const bestVM = { iou: -Infinity, prec: -Infinity, rec: -Infinity, f1: -Infinity };
      vmData.forEach(({ metrics: mx }) => {
        if (!mx) return;
        if (mx.iou && mx.iou.mean > bestVM.iou) bestVM.iou = mx.iou.mean;
        if (mx.precision && mx.precision.mean > bestVM.prec) bestVM.prec = mx.precision.mean;
        if (mx.recall && mx.recall.mean > bestVM.rec) bestVM.rec = mx.recall.mean;
        if (mx.f1 && mx.f1.mean > bestVM.f1) bestVM.f1 = mx.f1.mean;
      });
      let vmTbl = `\\begin{table*}[t]\n\\centering\n\\caption{Training Validation Metrics (Top 10 Epochs by IoU)}\n\\label{tab:validation_metrics}\n\\begin{tabular}{|l|c|c|c|c|}\n\\hline\n`;
      vmTbl += 'Training & Val mIoU & Precision & Recall & F1 \\\\\n\\hline\n';
      vmData.forEach(({ training, metrics: mx }) => {
        if (!mx) return;
        const name = training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
        vmTbl += `${name} `;
        const fmtVM = (vm: VM | undefined, best: number) => {
          if (!vm) return '& N/A ';
          const b = vm.mean === best;
          return `& ${b ? '\\textbf{' : ''}${(vm.mean * m).toFixed(d)} \\pm ${(vm.std * m).toFixed(d)}${b ? '}' : ''} `;
        };
        vmTbl += fmtVM(mx.iou, bestVM.iou);
        vmTbl += fmtVM(mx.precision, bestVM.prec);
        vmTbl += fmtVM(mx.recall, bestVM.rec);
        vmTbl += fmtVM(mx.f1, bestVM.f1);
        vmTbl += '\\\\ \\hline\n';
      });
      vmTbl += '\\end{tabular}\n\\end{table*}\n';
      out += vmTbl;
    }
    return out;
  }, [comparisonData, decimals, multiplier]);

  const testingLatex = React.useMemo(() => {
    if (!testResultsData.length) return '';
    const d = decimals;
    const m = multiplier;
    const conditions = ['day_fair', 'night_fair', 'day_rain', 'night_rain', 'snow'];
    const classNames = ['human', 'sign', 'vehicle'];
    let out = '';

    conditions.forEach(cond => {
      const condTitle = cond.replace('_', ' ').toUpperCase();

      // Performance metrics
      let perfTbl = `\\begin{table*}[t]\n\\centering\n\\caption{Performance Metrics - ${condTitle}}\n\\label{tab:performance_${cond}}\n`;
      perfTbl += `\\begin{tabular}{|l|${'c|c|c|c|c|'.repeat(classNames.length)}c|}\n\\hline\n`;
      perfTbl += 'Training & ' + classNames.map(cn => {
        const ct = cn[0].toUpperCase() + cn.slice(1);
        return `${ct} IoU & ${ct} Prec. & ${ct} Rec. & ${ct} F1 & ${ct} AP`;
      }).join(' & ') + ' & FW IoU \\\\\n\\hline\n';
      testResultsData.forEach(({ training, aggregatedResults }) => {
        const name = training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
        const condData = (aggregatedResults as any)?.[cond];
        perfTbl += `${name} `;
        classNames.forEach(cn => {
          const cls = condData?.[cn];
          const fmtM = (v: number | undefined) => v !== undefined ? `${(v * m).toFixed(d)}` : 'N/A';
          perfTbl += `& ${fmtM(cls?.iou?.mean)} `;
          perfTbl += `& ${fmtM(cls?.precision?.mean)} `;
          perfTbl += `& ${fmtM(cls?.recall?.mean)} `;
          perfTbl += `& ${fmtM(cls?.f1_score?.mean)} `;
          perfTbl += `& ${fmtM(cls?.ap?.mean)} `;
        });
        const fwIou = condData?.overall?.fw_iou?.mean;
        perfTbl += `& ${fwIou !== undefined ? `${(fwIou * m).toFixed(d)}` : 'N/A'} `;
        perfTbl += '\\\\ \\hline\n';
      });
      perfTbl += '\\end{tabular}\n\\end{table*}\n';
      out += perfTbl + '\n';

      // IoU metrics
      let iouTbl = `\\begin{table*}[t]\n\\centering\n\\caption{IoU Metrics - ${condTitle}}\n\\label{tab:iou_${cond}}\n`;
      iouTbl += `\\begin{tabular}{|l|${'c|'.repeat(classNames.length)}}\n\\hline\n`;
      iouTbl += 'Training & ' + classNames.map((cn, i) => {
        const ct = cn[0].toUpperCase() + cn.slice(1);
        return ct + ' IoU' + (i < classNames.length - 1 ? ' & ' : '');
      }).join('') + ' \\\\\n\\hline\n';
      testResultsData.forEach(({ training, aggregatedResults }) => {
        const name = training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
        const condData = (aggregatedResults as any)?.[cond];
        iouTbl += `${name} `;
        classNames.forEach(cn => {
          const v = condData?.[cn]?.iou?.mean;
          iouTbl += `& ${v !== undefined ? `${(v * m).toFixed(d)}` : 'N/A'} `;
        });
        iouTbl += '\\\\ \\hline\n';
      });
      iouTbl += '\\end{tabular}\n\\end{table*}\n';
      out += iouTbl + '\n';

      // AP metrics
      let apTbl = `\\begin{table*}[t]\n\\centering\n\\caption{AP Metrics - ${condTitle}}\n\\label{tab:ap_${cond}}\n`;
      apTbl += `\\begin{tabular}{|l|${'c|'.repeat(classNames.length)}}\n\\hline\n`;
      apTbl += 'Training & ' + classNames.map((cn, i) => {
        const ct = cn[0].toUpperCase() + cn.slice(1);
        return ct + ' AP' + (i < classNames.length - 1 ? ' & ' : '');
      }).join('') + ' \\\\\n\\hline\n';
      testResultsData.forEach(({ training, aggregatedResults }) => {
        const name = training.name.replace(/[&%$#_{}~^\\]/g, '\\$&');
        const condData = (aggregatedResults as any)?.[cond];
        apTbl += `${name} `;
        classNames.forEach(cn => {
          const v = condData?.[cn]?.ap?.mean;
          apTbl += `& ${v !== undefined ? `${(v * m).toFixed(d)}` : 'N/A'} `;
        });
        apTbl += '\\\\ \\hline\n';
      });
      apTbl += '\\end{tabular}\n\\end{table*}\n';
      out += apTbl + '\n';
    });
    return out;
  }, [testResultsData, decimals, multiplier]);

  const benchmarkingLatex = React.useMemo(() => {
    if (!benchmarksData.length) return '';

    // Mirror the same flattening logic as BenchmarksComparisonTable
    const gpuResults = benchmarksData
      .filter((b: any) => b.results?.some((r: any) =>
        r.device_type === 'gpu' || r.device_type === 'cuda' ||
        r.device?.toLowerCase().includes('gpu') ||
        (!r.device_type && !r.device)
      ))
      .flatMap((b: any) =>
        b.results
          .filter((r: any) =>
            r.device_type === 'gpu' || r.device_type === 'cuda' ||
            r.device?.toLowerCase().includes('gpu') ||
            (!r.device_type && !r.device)
          )
          .map((r: any) => ({ ...r, training_name: b.training_name }))
      );

    const cpuResults = benchmarksData
      .filter((b: any) => b.results?.some((r: any) =>
        r.device_type === 'cpu' || r.device?.toLowerCase().includes('cpu')
      ))
      .flatMap((b: any) =>
        b.results
          .filter((r: any) =>
            r.device_type === 'cpu' || r.device?.toLowerCase().includes('cpu')
          )
          .map((r: any) => ({ ...r, training_name: b.training_name }))
      );
    let out = '';

    const fmtBench = (result: any, device: 'gpu' | 'cpu') => {
      const name = result.training_name.replace(/[&%$#_{}~^\\]/g, '\\$&');
      const time = result.mean_time_ms && result.std_time_ms
        ? `${result.mean_time_ms.toFixed(1)} \\pm ${result.std_time_ms.toFixed(1)}`
        : result.mean_time_ms ? result.mean_time_ms.toFixed(1) : 'N/A';
      const fps = result.fps ? result.fps.toFixed(2) : 'N/A';
      const mem = device === 'gpu'
        ? (result.gpu_memory_mean_mb && result.gpu_memory_std_mb
          ? `${result.gpu_memory_mean_mb.toFixed(0)} \\pm ${result.gpu_memory_std_mb.toFixed(1)}`
          : result.gpu_memory_mean_mb ? result.gpu_memory_mean_mb.toFixed(0) : 'N/A')
        : (result.ram_memory_mean_mb && result.ram_memory_std_mb
          ? `${result.ram_memory_mean_mb.toFixed(0)} \\pm ${result.ram_memory_std_mb.toFixed(1)}`
          : result.ram_memory_mean_mb ? result.ram_memory_mean_mb.toFixed(0) : 'N/A');
      const params = result.total_parameters_m ? result.total_parameters_m.toFixed(1) : 'N/A';
      const flops = result.flops_giga ? result.flops_giga.toFixed(1) : 'N/A';
      const imgSz = result.image_size || 'N/A';
      const runs = result.num_runs || 'N/A';
      return `${name} & ${time} & ${fps} & ${mem} & ${params} & ${flops} & ${imgSz} & ${runs} \\\\\n`;
    };

    if (gpuResults.length) {
      const memCol = 'GPU Memory (MB)';
      let tbl = `\\begin{table*}[ht]\n\\centering\n\\caption{GPU Benchmark Performance Comparison}\n\\label{tab:gpu_benchmark}\n\\begin{tabular}{|l|c|c|c|c|c|c|c|}\n\\hline\n`;
      tbl += `Training & Time (ms) & FPS & ${memCol} & Params (M) & FLOPs (G) & Image Size & Num Runs \\\\\n\\hline\n`;
      gpuResults.forEach((r: any) => { tbl += fmtBench(r, 'gpu'); });
      tbl += '\\hline\n\\end{tabular}\n\\end{table*}\n';
      out += tbl + '\n';
    }

    if (cpuResults.length) {
      const memCol = 'RAM Memory (MB)';
      let tbl = `\\begin{table*}[ht]\n\\centering\n\\caption{CPU Benchmark Performance Comparison}\n\\label{tab:cpu_benchmark}\n\\begin{tabular}{|l|c|c|c|c|c|c|c|}\n\\hline\n`;
      tbl += `Training & Time (ms) & FPS & ${memCol} & Params (M) & FLOPs (G) & Image Size & Num Runs \\\\\n\\hline\n`;
      cpuResults.forEach((r: any) => { tbl += fmtBench(r, 'cpu'); });
      tbl += '\\hline\n\\end{tabular}\n\\end{table*}\n';
      out += tbl;
    }

    return out;
  }, [benchmarksData]);

  const allLatex = [trainingLatex, testingLatex, benchmarkingLatex]
    .filter(Boolean)
    .join('\n\n% ─────────────────────────────────────────────────\n\n');

  const handleCopyLatex = (_text: string, tabIndex: number) => {
    navigator.clipboard.writeText(allLatex);
    setCopiedSection(tabIndex);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  // ── end Export-all LaTeX ──────────────────────────────────────

  const isLoading = isComparisonLoading || isProjectLoading || isTrainingComparisonLoading;
  const error = comparisonError || trainingComparisonError;

  if (isLoading) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Loading comparison...
        </Typography>
      </Container>
    );
  }

  if (error || !comparison) {
    return (
      <Container maxWidth="lg" sx={{ pb: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load comparison. It may not exist or you don't have permission to view it.
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ pb: 4 }}>
      {/* Breadcrumbs */}
      <PageBreadcrumbs
        items={[
          { label: 'Projects', href: '/projects' },
          ...(project ? [{ label: project.name, href: `/projects/${project.slug || project._id}` }] : []),
          { label: comparison.name, current: true }
        ]}
      />

      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" component="h1" gutterBottom>
              {comparison.name}
            </Typography>

            {comparison.description && (
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                {comparison.description}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Tooltip title="Export All LaTeX">
              <Button
                variant="outlined"
                size="small"
                startIcon={<CodeIcon />}
                onClick={() => { setExportLatexOpen(true); setExportLatexTab(0); }}
                disabled={!comparisonData.length}
              >
                Export LaTeX
              </Button>
            </Tooltip>
            <Tooltip title="Edit Comparison">
              <IconButton
                onClick={handleEditComparison}
                color="primary"
                sx={{ 
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                <EditIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete Comparison">
              <IconButton
                onClick={handleDeleteComparison}
                color="error"
                sx={{ 
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' }
                }}
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary">
          Created: {formatDate(comparison.createdAt)}
          {comparison.updatedAt !== comparison.createdAt && (
            <> • Updated: {formatDate(comparison.updatedAt)}</>
          )}
        </Typography>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)}>
          <Tab label="Training Metrics" />
          <Tab label="Test Results" />
          <Tab label="Benchmarks" />
        </Tabs>
      </Box>

      {/* Tab Content */}
      {activeTab === 0 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Training Metrics Comparison
          </Typography>
          
          {/* Number Formatting Controls */}
          <NumberFormattingControls
            decimals={decimals}
            multiplier={multiplier}
            onDecimalsChange={setDecimals}
            onMultiplierChange={setMultiplier}
          />
          
          {comparisonData.length > 0 ? (
            <>
              <ComparisonTable 
                comparisonData={comparisonData}
                decimals={decimals}
                multiplier={multiplier}
              />
              
              <Box sx={{ mt: 4 }}>
                <TrainingClassIoUTable 
                  comparisonData={comparisonData}
                  decimals={decimals}
                  multiplier={multiplier}
                />
              </Box>

              <Box sx={{ mt: 4 }}>
                <TrainingValidationMetricsTable 
                  comparisonData={comparisonData}
                  decimals={decimals}
                  multiplier={multiplier}
                />
              </Box>
            </>
          ) : (
            <Alert severity="info">No training data available for comparison.</Alert>
          )}
        </Box>
      )}

      {activeTab === 1 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Test Results Comparison
          </Typography>
          
          {/* Number Formatting Controls */}
          <NumberFormattingControls
            decimals={decimals}
            multiplier={multiplier}
            onDecimalsChange={setDecimals}
            onMultiplierChange={setMultiplier}
          />
          
          {testResultsData.length > 0 ? (
            <>
              <PerformanceMetricsTable 
                comparisonData={testResultsData}
                decimals={decimals}
                multiplier={multiplier}
              />
              <Box sx={{ mt: 4 }}>
                <IoUMetricsTable 
                  comparisonData={testResultsData}
                  decimals={decimals}
                  multiplier={multiplier}
                />
              </Box>
              <Box sx={{ mt: 4 }}>
                <APMetricsTable 
                  comparisonData={testResultsData}
                  decimals={decimals}
                  multiplier={multiplier}
                />
              </Box>
            </>
          ) : (
            <Alert severity="info">No test results available for comparison.</Alert>
          )}
        </Box>
      )}

      {activeTab === 2 && (
        <Box>
          <Typography variant="h6" gutterBottom>
            Benchmarks Comparison
          </Typography>
          {benchmarksData.length > 0 ? (
            <BenchmarksComparisonTable benchmarks={benchmarksData} />
          ) : (
            <Alert severity="info">No benchmark data available for comparison.</Alert>
          )}
        </Box>
      )}
      
      {/* Edit Comparison Dialog */}
      <Dialog open={editDialogOpen} onClose={handleCancelEdit} maxWidth="md" fullWidth>
        <DialogTitle>Edit Comparison</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Comparison Title"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Description (optional)"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              multiline
              rows={2}
              sx={{ mb: 3 }}
            />

            <Typography variant="h6" sx={{ mb: 2 }}>
              Select Trainings
            </Typography>

            <TrainingSelector
              trainings={trainings}
              selectedTrainingIds={editSelectedIds}
              onTrainingToggle={handleEditTrainingIdToggle}
              maxSelections={20}
              isLoading={isTrainingsLoading}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelEdit}>Cancel</Button>
          <Button 
            onClick={handleUpdateComparison} 
            variant="contained"
            disabled={!editName.trim() || editSelectedIds.length === 0 || updating}
          >
            {updating ? <CircularProgress size={20} /> : 'Update'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteComparisonDialog
        open={deleteDialogOpen}
        onClose={handleCancelDelete}
        onConfirm={handleConfirmDelete}
      />

      {/* Export All LaTeX Dialog */}
      <Dialog
        open={exportLatexOpen}
        onClose={() => setExportLatexOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Export All LaTeX</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                startIcon={<ContentCopyIcon />}
                onClick={() => handleCopyLatex('', 0)}
                disabled={!allLatex}
              >
                {copiedSection !== null ? 'Copied!' : 'Copy All Tabs'}
              </Button>
              <Button size="small" onClick={() => setExportLatexOpen(false)}>Close</Button>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
            <Tabs
              value={exportLatexTab}
              onChange={(_, v) => setExportLatexTab(v)}
            >
              <Tab label="Training" />
              <Tab label="Testing" />
              <Tab label="Benchmarking" />
            </Tabs>
          </Box>

          {[trainingLatex, testingLatex, benchmarkingLatex].map((latexCode, idx) => (
            <Box
              key={idx}
              role="tabpanel"
              hidden={exportLatexTab !== idx}
              sx={{ p: 3 }}
            >
              {exportLatexTab === idx && (
                latexCode ? (
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      bgcolor: '#f5f5f5',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      whiteSpace: 'pre-wrap',
                      maxHeight: '60vh',
                      overflow: 'auto',
                      border: '1px solid',
                      borderColor: 'divider'
                    }}
                  >
                    {latexCode}
                  </Paper>
                ) : (
                  <Alert severity="info">
                    No data available for this section.
                  </Alert>
                )
              )}
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportLatexOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ComparisonDetailPage;