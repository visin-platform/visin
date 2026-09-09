import type { ComparisonEpoch, TrainingComparison, EpochMetrics, BenchmarkResult } from '@/types';
import { formatTime, formatNumber } from '../comparisonLatexGenerator';
import type { ResolvedTaxonomy } from '@/types/taxonomy';

interface MetricStat {
  mean: number;
  std: number;
}
type ClassAggregates = Record<string, MetricStat>;
type ConditionAggregates = Record<string, ClassAggregates>;

export interface TestResultsDatum {
  // Matches TrainingComparison['aggregatedTestResults']'s loose shape; the
  // more precise ConditionAggregates/ClassAggregates nesting is applied via
  // a cast at the point of use below, once per condition being read.
  aggregatedResults: Record<string, Record<string, unknown>> | null;
  training: TrainingComparison['training'];
  testResultsCount: number;
}

/**
 * Builds the "Export All LaTeX" training-metrics tab: detailed comparison
 * table, per-class validation IoU, and validation metrics (top-10 epochs by
 * val mIoU). Pure data transform, extracted from ComparisonDetailPage so the
 * page component stays focused on data-fetching and layout.
 */
export function generateTrainingLatex(
  comparisonData: TrainingComparison[],
  decimals: number,
  multiplier: number
): string {
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
          const cd = val[k] as EpochMetrics | undefined;
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
        const cd = val[k] as EpochMetrics | undefined;
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
}

/**
 * Builds the "Export All LaTeX" testing tab: performance/IoU/AP metrics per
 * condition. See generateTrainingLatex for extraction context.
 *
 * Conditions, classes and the summary column all come from the taxonomy resolved
 * against these results, so the tables are as wide as the data — not as wide as
 * one particular dataset happened to be.
 */
export function generateTestingLatex(
  testResultsData: TestResultsDatum[],
  decimals: number,
  multiplier: number,
  taxonomy: ResolvedTaxonomy
): string {
  if (!testResultsData.length) return '';
  const d = decimals;
  const m = multiplier;
  const conditions = taxonomy.conditions;
  const classes = taxonomy.classes;
  if (!conditions.length || !classes.length) return '';

  const perfMetrics = ['iou', 'precision', 'recall', 'f1_score', 'ap'];
  const summaryMetric = taxonomy.overallMetrics[0];
  const esc = (v: string) => v.replace(/[&%$#_{}~^\\]/g, '\\$&');
  const fmt = (v: number | undefined) => (v !== undefined ? `${(v * m).toFixed(d)}` : 'N/A');

  /** One class-by-metric table for a single condition. */
  const table = (
    caption: string,
    label: string,
    metrics: string[],
    withSummary: boolean,
    cond: string
  ) => {
    const perClassSpec = 'c|'.repeat(metrics.length).repeat(classes.length);
    let tbl = `\\begin{table*}[t]\n\\centering\n\\caption{${caption}}\n\\label{${label}}\n`;
    tbl += `\\begin{tabular}{|l|${perClassSpec}${withSummary && summaryMetric ? 'c|' : ''}}\n\\hline\n`;

    const headers = classes.flatMap(cls =>
      metrics.map(metric => `${esc(cls.label)} ${esc(taxonomy.metric(metric).label)}`)
    );
    if (withSummary && summaryMetric) {
      headers.push(esc(summaryMetric.label));
    }
    tbl += `Training & ${headers.join(' & ')} \\\\\n\\hline\n`;

    testResultsData.forEach(({ training, aggregatedResults }) => {
      const condData = aggregatedResults?.[cond] as ConditionAggregates | undefined;
      tbl += `${esc(training.name)} `;
      classes.forEach(cls => {
        metrics.forEach(metric => {
          tbl += `& ${fmt(condData?.[cls.key]?.[metric]?.mean)} `;
        });
      });
      if (withSummary && summaryMetric) {
        tbl += `& ${fmt(condData?.overall?.[summaryMetric.key]?.mean)} `;
      }
      tbl += '\\\\ \\hline\n';
    });

    return `${tbl}\\end{tabular}\n\\end{table*}\n`;
  };

  let out = '';
  conditions.forEach(condition => {
    const condTitle = esc(condition.label.toUpperCase());
    const cond = condition.key;

    out += table(`Performance Metrics - ${condTitle}`, `tab:performance_${cond}`, perfMetrics, true, cond) + '\n';
    out += table(`IoU Metrics - ${condTitle}`, `tab:iou_${cond}`, ['iou'], false, cond) + '\n';
    out += table(`AP Metrics - ${condTitle}`, `tab:ap_${cond}`, ['ap'], false, cond) + '\n';
  });
  return out;
}

/**
 * Builds the "Export All LaTeX" benchmarking tab: GPU/CPU performance
 * tables. Mirrors the flattening logic in BenchmarksComparisonTable.
 */
// Only `results` + `training_name` are read below — not the full Benchmark shape.
interface BenchmarkWithTrainingName {
  results: BenchmarkResult[];
  training_name: string;
}
type BenchmarkResultWithTrainingName = BenchmarkResult & { training_name: string };

export function generateBenchmarkingLatex(benchmarksData: BenchmarkWithTrainingName[]): string {
  if (!benchmarksData.length) return '';

  const gpuResults: BenchmarkResultWithTrainingName[] = benchmarksData
    .filter((b) => b.results?.some((r) =>
      r.device_type === 'gpu' || r.device_type === 'cuda' ||
      r.device?.toLowerCase().includes('gpu') ||
      (!r.device_type && !r.device)
    ))
    .flatMap((b) =>
      b.results
        .filter((r) =>
          r.device_type === 'gpu' || r.device_type === 'cuda' ||
          r.device?.toLowerCase().includes('gpu') ||
          (!r.device_type && !r.device)
        )
        .map((r) => ({ ...r, training_name: b.training_name }))
    );

  const cpuResults: BenchmarkResultWithTrainingName[] = benchmarksData
    .filter((b) => b.results?.some((r) =>
      r.device_type === 'cpu' || r.device?.toLowerCase().includes('cpu')
    ))
    .flatMap((b) =>
      b.results
        .filter((r) =>
          r.device_type === 'cpu' || r.device?.toLowerCase().includes('cpu')
        )
        .map((r) => ({ ...r, training_name: b.training_name }))
    );
  let out = '';

  const fmtBench = (result: BenchmarkResultWithTrainingName, device: 'gpu' | 'cpu') => {
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
    gpuResults.forEach((r) => { tbl += fmtBench(r, 'gpu'); });
    tbl += '\\hline\n\\end{tabular}\n\\end{table*}\n';
    out += tbl + '\n';
  }

  if (cpuResults.length) {
    const memCol = 'RAM Memory (MB)';
    let tbl = `\\begin{table*}[ht]\n\\centering\n\\caption{CPU Benchmark Performance Comparison}\n\\label{tab:cpu_benchmark}\n\\begin{tabular}{|l|c|c|c|c|c|c|c|}\n\\hline\n`;
    tbl += `Training & Time (ms) & FPS & ${memCol} & Params (M) & FLOPs (G) & Image Size & Num Runs \\\\\n\\hline\n`;
    cpuResults.forEach((r) => { tbl += fmtBench(r, 'cpu'); });
    tbl += '\\hline\n\\end{tabular}\n\\end{table*}\n';
    out += tbl;
  }

  return out;
}
