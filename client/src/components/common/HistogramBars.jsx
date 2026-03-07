import { Box, Tooltip, Typography } from '@mui/material';

export default function HistogramBars({
  data = [],
  height = 180,
  barColor = 'primary.main',
  showCounts = true,
}) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const counts = data.map((item) => Number(item?.count) || 0);
  const maxCount = Math.max(...counts, 1);

  return (
    <Box sx={{ mb: 1, overflowX: 'auto' }}>
      <Box
        sx={{
          minWidth: Math.max(data.length * 44, 280),
          display: 'flex',
          alignItems: 'flex-end',
          gap: 0.75,
          height: height + (showCounts ? 40 : 26),
        }}
      >
        {data.map((item, index) => {
          const label = item?.bin ?? '';
          const count = Number(item?.count) || 0;
          const barHeight = count > 0 ? Math.max(8, Math.round((count / maxCount) * height)) : 2;

          return (
            <Box
              key={`${label}-${index}`}
              sx={{
                flex: 1,
                minWidth: 28,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              <Tooltip title={`${label}: ${count}`} arrow>
                <Box sx={{ width: '100%', height, display: 'flex', alignItems: 'flex-end' }}>
                  <Box
                    sx={{
                      width: '100%',
                      height: barHeight,
                      bgcolor: barColor,
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.25s ease-out',
                    }}
                  />
                </Box>
              </Tooltip>
              <Typography variant="caption" sx={{ mt: 0.5 }} noWrap>
                {label}
              </Typography>
              {showCounts && (
                <Typography variant="caption" color="text.secondary">
                  {count}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
