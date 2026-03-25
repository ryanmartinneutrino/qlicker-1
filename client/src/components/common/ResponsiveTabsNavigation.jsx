import { MenuItem, Tab, Tabs, TextField } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTranslation } from 'react-i18next';

export default function ResponsiveTabsNavigation({
  value,
  onChange,
  tabs = [],
  ariaLabel = '',
  dropdownLabel = '',
  tabsProps = {},
  dropdownSx = {},
}) {
  const { t } = useTranslation();
  const compact = useMediaQuery('(max-width:799px)');
  const normalizedTabs = tabs.map((tab, index) => ({
    ...tab,
    value: tab?.value ?? index,
  }));
  const valueMap = new Map(normalizedTabs.map((tab) => [String(tab.value), tab.value]));

  if (compact) {
    return (
      <TextField
        select
        size="small"
        label={dropdownLabel || t('common.view')}
        value={String(value)}
        onChange={(event) => onChange(valueMap.get(event.target.value))}
        sx={{ minWidth: 220, maxWidth: 420, ...dropdownSx }}
      >
        {normalizedTabs.map((tab) => (
          <MenuItem key={String(tab.value)} value={String(tab.value)} disabled={tab.disabled}>
            {tab.dropdownLabel || tab.menuLabel || (typeof tab.label === 'string' ? tab.label : '')}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  const { sx: tabsSx, ...restTabsProps } = tabsProps;

  return (
    <Tabs
      value={value}
      onChange={(_, nextValue) => onChange(nextValue)}
      aria-label={ariaLabel}
      {...restTabsProps}
      sx={tabsSx}
    >
      {normalizedTabs.map((tab) => (
        <Tab
          key={String(tab.value)}
          value={tab.value}
          label={tab.label}
          disabled={tab.disabled}
          {...tab.tabProps}
        />
      ))}
    </Tabs>
  );
}
