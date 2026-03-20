import { useState, useCallback } from 'react';
import { Box, Button, Typography, CircularProgress, TextField } from '@mui/material';
import {
  Refresh as RefreshIcon,
  VisibilityOff as HideIcon,
  Visibility as ShowIcon,
  BarChart as HistogramIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import HistogramBars from '../common/HistogramBars';

/**
 * HistogramPanel wraps the histogram display with action buttons and range controls.
 *
 * Props:
 *   histogramData    - { bins, overflowLow, overflowHigh, rangeMin, rangeMax, numBins, visible, generatedAt } or null
 *   onGenerate       - async ({ numBins, rangeMin, rangeMax }) => void — called when prof clicks Generate/Refresh/Redraw
 *   onToggleVisible  - async (visible: boolean) => void — toggle visibility (prof only)
 *   showControls     - show generate/refresh/hide buttons (prof view)
 *   height           - bar chart height (default 180)
 */
export default function HistogramPanel({
  histogramData,
  onGenerate,
  onToggleVisible,
  showControls = false,
  height = 180,
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [customMin, setCustomMin] = useState('');
  const [customMax, setCustomMax] = useState('');
  const [customBins, setCustomBins] = useState('');
  const [rangeChanged, setRangeChanged] = useState(false);

  const hasHistogram = histogramData?.bins?.length > 0;
  const isVisible = histogramData?.visible !== false;

  const handleGenerate = useCallback(async (opts = {}) => {
    if (!onGenerate) return;
    setLoading(true);
    try {
      await onGenerate(opts);
      setRangeChanged(false);
    } finally {
      setLoading(false);
    }
  }, [onGenerate]);

  const handleToggleVisible = useCallback(async () => {
    if (!onToggleVisible) return;
    setLoading(true);
    try {
      await onToggleVisible(!isVisible);
    } finally {
      setLoading(false);
    }
  }, [onToggleVisible, isVisible]);

  const handleRedraw = useCallback(() => {
    const opts = {};
    if (customMin !== '') opts.rangeMin = Number(customMin);
    if (customMax !== '') opts.rangeMax = Number(customMax);
    if (customBins !== '') opts.numBins = Math.max(1, Math.round(Number(customBins)));
    handleGenerate(opts);
  }, [handleGenerate, customMin, customMax, customBins]);

  const handleRangeFieldChange = useCallback((setter) => (e) => {
    setter(e.target.value);
    setRangeChanged(true);
  }, []);

  // Build display data: prepend overflow low, append overflow high
  const displayData = [];
  if (hasHistogram) {
    if (histogramData.overflowLow > 0) {
      displayData.push({
        bin: t('histogram.overflowLow', { value: histogramData.rangeMin }),
        count: histogramData.overflowLow,
      });
    }
    for (const b of histogramData.bins) {
      displayData.push({ bin: b.label, count: b.count });
    }
    if (histogramData.overflowHigh > 0) {
      displayData.push({
        bin: t('histogram.overflowHigh', { value: histogramData.rangeMax }),
        count: histogramData.overflowHigh,
      });
    }
  }

  // Prof controls: Generate / Refresh / Hide / Show + range controls
  if (showControls) {
    return (
      <Box sx={{ mb: 2 }} aria-label={t('histogram.ariaLabel')}>
        {!hasHistogram ? (
          /* No histogram generated yet — show generate button */
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={18} /> : <HistogramIcon />}
              onClick={() => handleGenerate()}
              disabled={loading}
            >
              {t('histogram.generate')}
            </Button>
          </Box>
        ) : (
          /* Histogram exists */
          <>
            {isVisible && displayData.length > 0 && (
              <HistogramBars data={displayData} height={height} />
            )}
            {!isVisible && (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 1 }}>
                {t('histogram.hidden')}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
                onClick={() => handleGenerate()}
                disabled={loading}
              >
                {t('histogram.refresh')}
              </Button>
              {onToggleVisible && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={isVisible ? <HideIcon /> : <ShowIcon />}
                  onClick={handleToggleVisible}
                  disabled={loading}
                >
                  {isVisible ? t('histogram.hide') : t('histogram.show')}
                </Button>
              )}
            </Box>
            {/* Range controls */}
            {isVisible && (
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField
                  size="small"
                  label={t('histogram.min')}
                  type="number"
                  value={customMin}
                  onChange={handleRangeFieldChange(setCustomMin)}
                  placeholder={histogramData.rangeMin != null ? String(histogramData.rangeMin) : ''}
                  sx={{ width: 100 }}
                  inputProps={{ 'aria-label': t('histogram.min') }}
                />
                <TextField
                  size="small"
                  label={t('histogram.max')}
                  type="number"
                  value={customMax}
                  onChange={handleRangeFieldChange(setCustomMax)}
                  placeholder={histogramData.rangeMax != null ? String(histogramData.rangeMax) : ''}
                  sx={{ width: 100 }}
                  inputProps={{ 'aria-label': t('histogram.max') }}
                />
                <TextField
                  size="small"
                  label={t('histogram.bins')}
                  type="number"
                  value={customBins}
                  onChange={handleRangeFieldChange(setCustomBins)}
                  placeholder={histogramData.numBins != null ? String(histogramData.numBins) : '20'}
                  sx={{ width: 80 }}
                  inputProps={{ min: 1, 'aria-label': t('histogram.bins') }}
                />
                {rangeChanged && (
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleRedraw}
                    disabled={loading}
                  >
                    {t('histogram.redraw')}
                  </Button>
                )}
              </Box>
            )}
          </>
        )}
      </Box>
    );
  }

  // Student / presentation view: only show if histogram data exists and is visible
  if (!hasHistogram || !isVisible) return null;

  return (
    <Box sx={{ mb: 2 }} aria-label={t('histogram.ariaLabel')}>
      {displayData.length > 0 && (
        <HistogramBars data={displayData} height={height} />
      )}
    </Box>
  );
}
