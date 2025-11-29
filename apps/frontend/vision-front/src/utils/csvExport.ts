import { Training } from '../types';

// Utility functions
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const time = date.toLocaleTimeString('en-GB', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
  return `${day}.${month}.${year} ${time}`;
};

const formatDuration = (seconds: number) => {
  if (seconds === 0) return '0s';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
};

export const exportTrainingsToCSV = (trainings: Training[]) => {
  const headers = [
    'Name',
    'Description',
    'Status',
    'Time',
    'CPU Cost',
    'GPU Cost',
    'Total Cost',
    'Created',
    'Updated',
    'Tags'
  ];

  const csvData = trainings.map(training => [
    training.name,
    training.description || '',
    training.status,
    training.metrics ? formatDuration(training.metrics.totalTime) : '',
    training.metrics ? `${training.metrics.cpuCost.toFixed(3)} EUR` : '',
    training.metrics ? `${training.metrics.gpuCost.toFixed(3)} EUR` : '',
    training.metrics ? `${training.metrics.totalCost.toFixed(3)} EUR` : '',
    formatDate(training.createdAt),
    formatDate(training.updatedAt),
    training.tags ? training.tags.join('; ') : ''
  ]);

  // Combine headers and data
  const csvContent = [headers, ...csvData]
    .map(row => row.map(field => `"${field}"`).join(','))
    .join('\n');

  // Create and download the file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `trainings_export_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};