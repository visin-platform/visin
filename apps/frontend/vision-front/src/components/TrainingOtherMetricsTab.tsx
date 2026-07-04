import React from 'react';
import { Paper, Typography, Box } from '@mui/material';
import { LineChart } from '@mui/x-charts';
import { Epoch } from '../types';

interface TrainingOtherMetricsTabProps {
  epochs: Epoch[];
}

const TrainingOtherMetricsTab: React.FC<TrainingOtherMetricsTabProps> = ({ epochs }) => {
  if (epochs.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          No epochs available to display other metrics.
        </Typography>
      </Paper>
    );
  }

  const epochNumbers = epochs.map(e => e.epoch);

  // Extract math_metrics data
  const eceData = epochs.map(epoch => {
    const mathMetrics = epoch.results?.val?.math_metrics as any;
    return mathMetrics?.ece ?? null;
  });

  const standardIouData = epochs.map(epoch => {
    const valResults = epoch.results?.val as any;
    return valResults?.standard_iou ?? null;
  });

  const overallMarginData = epochs.map(epoch => {
    const mathMetrics = epoch.results?.val?.math_metrics as any;
    return mathMetrics?.overall_margin ?? null;
  });

  const overallVarianceData = epochs.map(epoch => {
    const mathMetrics = epoch.results?.val?.math_metrics as any;
    return mathMetrics?.overall_variance ?? null;
  });

  // Extract bin accuracies and confidences
  const binAccuraciesData = epochs.map(epoch => {
    const mathMetrics = epoch.results?.val?.math_metrics as any;
    return mathMetrics?.bin_accuracies || [];
  });

  const binConfidencesData = epochs.map(epoch => {
    const mathMetrics = epoch.results?.val?.math_metrics as any;
    return mathMetrics?.bin_confidences || [];
  });

  // Extract margins and variances per class
  const marginsPerClassData = epochs.map(epoch => {
    const mathMetrics = epoch.results?.val?.math_metrics as any;
    return mathMetrics?.margins_per_class || {};
  });

  const variancesPerClassData = epochs.map(epoch => {
    const mathMetrics = epoch.results?.val?.math_metrics as any;
    return mathMetrics?.variance_per_class || {};
  });

  // Get all unique class names from margins_per_class
  const allClasses = new Set<string>();
  marginsPerClassData.forEach(margins => {
    Object.keys(margins).forEach(className => allClasses.add(className));
  });
  variancesPerClassData.forEach(variances => {
    Object.keys(variances).forEach(className => allClasses.add(className));
  });
  const classesArray = Array.from(allClasses).sort();

  // Check if we have any math_metrics data
  const hasMathMetrics = eceData.some(v => v !== null) ||
                        standardIouData.some(v => v !== null) ||
                        overallMarginData.some(v => v !== null) ||
                        overallVarianceData.some(v => v !== null) ||
                        binAccuraciesData.some(arr => arr.length > 0) ||
                        binConfidencesData.some(arr => arr.length > 0) ||
                        classesArray.length > 0;

  if (!hasMathMetrics) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="body2" sx={{
          color: "text.secondary"
        }}>
          No math metrics data available in the epochs.
        </Typography>
      </Paper>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ECE Over Epochs */}
      {eceData.some(v => v !== null) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Expected Calibration Error (ECE) Over Epochs
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 2
            }}>
            Measures the difference between predicted confidence and actual accuracy across all predictions.
            Calculated by binning predictions by confidence, computing |accuracy - confidence| in each bin, weighted by bin size.
            Perfect calibration = 0. Lower values indicate better calibrated models. Values &gt; 0.1 suggest significant miscalibration.
            Tracks how well the model's probability estimates improve during training.
          </Typography>
          <Box sx={{ width: '100%', height: 400 }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={[{
                data: eceData,
                label: 'ECE',
                color: '#1976d2',
                showMark: false
              }]}
              margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'horizontal',
                  position: { vertical: 'top', horizontal: 'center' }
                }
              }}
            />
          </Box>
        </Paper>
      )}
      {/* Standard IoU Over Epochs */}
      {standardIouData.some(v => v !== null) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Standard IoU Over Epochs
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 2
            }}>
            <strong>Intersection over Union (IoU):</strong> Measures the overlap between predicted and ground truth segmentation masks.
            Calculated as the area of intersection divided by the area of union. Values range from 0 (no overlap) to 1 (perfect overlap).<br/><br/>
            <strong>Interpretation:</strong> Higher IoU values indicate better segmentation performance. 
            IoU is more strict than pixel accuracy since it requires both precision and recall to be high.
            Values above 0.8 are considered excellent, 0.5-0.8 are good, below 0.5 may need improvement.
            This metric tracks how well your model's segmentation predictions match the ground truth over training.
          </Typography>
          <Box sx={{ width: '100%', height: 400 }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={[{
                data: standardIouData,
                label: 'Standard IoU',
                color: '#2e7d32',
                showMark: false
              }]}
              margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'horizontal',
                  position: { vertical: 'top', horizontal: 'center' }
                }
              }}
            />
          </Box>
        </Paper>
      )}
      {/* Overall Margin and Variance */}
      {(overallMarginData.some(v => v !== null) || overallVarianceData.some(v => v !== null)) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Prediction Confidence Metrics Over Epochs
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 2
            }}>
            <strong>Overall Margin:</strong> Average difference between the logit of the correct class and the highest logit of incorrect classes. 
            Measures how decisively the model predicts the correct answer. Higher margins indicate more confident and separable predictions. 
            Values around 5-8 are generally very good, showing strong class separation. Negative margins suggest frequent prediction errors.<br/><br/>
            <strong>Overall Variance:</strong> Standard deviation of logit values across all predictions and classes. 
            Lower variance indicates more consistent prediction confidence levels. Values around 5-8 are moderate and acceptable - 
            they suggest reasonable confidence variation without extreme over/under-confidence. Very low (&lt;2) might indicate under-confidence, 
            very high (&gt;10) might suggest decision boundary issues or over-confidence.
          </Typography>
          <Box sx={{ width: '100%', height: 400 }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={[
                ...(overallMarginData.some(v => v !== null) ? [{
                  data: overallMarginData,
                  label: 'Overall Margin',
                  color: '#d32f2f',
                  showMark: false
                }] : []),
                ...(overallVarianceData.some(v => v !== null) ? [{
                  data: overallVarianceData,
                  label: 'Overall Variance',
                  color: '#f57c00',
                  showMark: false
                }] : [])
              ]}
              margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'horizontal',
                  position: { vertical: 'top', horizontal: 'center' }
                }
              }}
            />
          </Box>
        </Paper>
      )}
      {/* Bin Accuracies */}
      {binAccuraciesData.some(arr => arr.length > 0) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Bin Accuracies Over Epochs
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 2
            }}>
            Shows the actual accuracy achieved within each confidence bin. Predictions are divided into multiple confidence ranges (bins).
            Each bin represents a different confidence level range, with Bin 1 being the lowest confidence and higher-numbered bins having higher confidence.<br/>
            <strong>Interpretation:</strong> For perfect calibration, accuracy should increase as confidence increases.
            If lower-confidence bins show high accuracy, your model is overconfident.
            If higher-confidence bins show low accuracy, your model is underconfident.
            The number of bins depends on your calibration analysis configuration.
          </Typography>
          <Box sx={{ width: '100%', height: 400 }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={binAccuraciesData[0]?.map((_: number, binIndex: number) => ({
                data: epochs.map(epoch => {
                  const bins = (epoch.results?.val?.math_metrics as any)?.bin_accuracies;
                  return bins && bins[binIndex] !== undefined ? bins[binIndex] : null;
                }),
                label: `Bin ${binIndex + 1}`,
                color: ['#1976d2', '#d32f2f', '#f57c00', '#388e3c'][binIndex % 4],
                showMark: false
              })) || []}
              margin={{ top: 10, bottom: 80, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'horizontal',
                  position: { vertical: 'bottom', horizontal: 'center' }
                }
              }}
            />
          </Box>
        </Paper>
      )}
      {/* Bin Confidences */}
      {binConfidencesData.some(arr => arr.length > 0) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Bin Confidences Over Epochs
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 2
            }}>
            Shows the average confidence scores within each confidence bin. Each bin shows the typical confidence level of predictions that fall into that range,
            with Bin 1 being the lowest confidence and higher-numbered bins having higher confidence.<br/>
            <strong>Interpretation:</strong> For well-calibrated bins, the average confidence should be close to the bin center.
            Compare these values with the Bin Accuracies chart - if a bin has high average confidence but low accuracy, 
            the model is overconfident. If it has low average confidence but high accuracy, the model is underconfident.
            These confidence values are used together with accuracies to calculate the Expected Calibration Error (ECE).
          </Typography>
          <Box sx={{ width: '100%', height: 400 }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={binConfidencesData[0]?.map((_: number, binIndex: number) => ({
                data: epochs.map(epoch => {
                  const bins = (epoch.results?.val?.math_metrics as any)?.bin_confidences;
                  return bins && bins[binIndex] !== undefined ? bins[binIndex] : null;
                }),
                label: `Bin ${binIndex + 1}`,
                color: ['#1976d2', '#d32f2f', '#f57c00', '#388e3c'][binIndex % 4],
                showMark: false
              })) || []}
              margin={{ top: 10, bottom: 80, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'horizontal',
                  position: { vertical: 'bottom', horizontal: 'center' }
                }
              }}
            />
          </Box>
        </Paper>
      )}
      {/* Margins per Class */}
      {classesArray.length > 0 && marginsPerClassData.some(margins => Object.keys(margins).length > 0) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Margins per Class Over Epochs
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 2
            }}>
            Shows logit margins for each class over training epochs. The number of classes shown depends on your dataset and training configuration.<br/>
            <strong>What it measures:</strong> For each class, the margin is the difference between that class's logit and the highest logit of any incorrect class.
            Higher positive values mean the model is very confident and decisive about that class.<br/><br/>
            <strong>Interpretation:</strong> Look for consistent positive margins across classes. 
            Classes with zero or negative margins may indicate prediction difficulties or insufficient training data for those classes.
            The classes shown are those that appear in your validation set during training.
          </Typography>
          <Box sx={{ width: '100%', height: 400 }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={classesArray.map((className, index) => ({
                data: epochs.map(epoch => {
                  const margins = (epoch.results?.val?.math_metrics as any)?.margins_per_class;
                  return margins && margins[className] !== undefined ? margins[className] : null;
                }),
                label: `Class ${className}`,
                color: ['#1976d2', '#d32f2f', '#f57c00', '#388e3c', '#7b1fa2'][index % 5],
                showMark: false
              }))}
              margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'horizontal',
                  position: { vertical: 'top', horizontal: 'center' }
                }
              }}
            />
          </Box>
        </Paper>
      )}
      {/* Variances per Class */}
      {classesArray.length > 0 && variancesPerClassData.some(variances => Object.keys(variances).length > 0) && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Variances per Class Over Epochs
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 2
            }}>
            Shows logit variance for each class over training epochs. The number of classes shown depends on your dataset and training configuration.<br/>
            <strong>What it measures:</strong> For each class, the variance measures how spread out the logit predictions are for pixels of that class.
            Lower variance indicates more consistent predictions for that class.<br/><br/>
            <strong>Interpretation:</strong> Look for reasonable variance levels (not too high, not too low).
            Very high variance might indicate inconsistent feature learning for that class.
            Classes with zero variance may have insufficient data or may not appear in the validation set.
          </Typography>
          <Box sx={{ width: '100%', height: 400 }}>
            <LineChart
              xAxis={[{ data: epochNumbers, label: 'Epoch' }]}
              series={classesArray.map((className, index) => ({
                data: epochs.map(epoch => {
                  const variances = (epoch.results?.val?.math_metrics as any)?.variance_per_class;
                  return variances && variances[className] !== undefined ? variances[className] : null;
                }),
                label: `Class ${className}`,
                color: ['#1976d2', '#d32f2f', '#f57c00', '#388e3c', '#7b1fa2'][index % 5],
                showMark: false
              }))}
              margin={{ top: 10, bottom: 40, left: 60, right: 10 }}
              slotProps={{
                legend: {
                  direction: 'horizontal',
                  position: { vertical: 'top', horizontal: 'center' }
                }
              }}
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default TrainingOtherMetricsTab;