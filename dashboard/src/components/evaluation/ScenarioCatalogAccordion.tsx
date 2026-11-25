import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  TextField,
  InputAdornment,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tabs,
  Tab,
} from '@mui/material';
import {
  ChevronDown,
  Search,
  Shield,
  RefreshCw,
  Lock,
  Bot,
  Gauge,
} from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { ScenarioCatalogItem, ScenarioCatalogResponse } from '../../api/types';

interface ScenarioCatalogAccordionProps {
  catalog?: ScenarioCatalogResponse;
  loading?: boolean;
}

const SUITE_ICONS: Record<string, React.ReactElement> = {
  reliability: <Shield size={16} />,
  recovery: <RefreshCw size={16} />,
  security: <Lock size={16} />,
  agent: <Bot size={16} />,
  benchmarks: <Gauge size={16} />,
};

const SUITE_TITLES: Record<string, string> = {
  reliability: 'Reliability & Invariants',
  recovery: 'Recovery & Durability',
  security: 'Security & Sandboxing',
  agent: 'Agent Reasoning & Behavioral',
  benchmarks: 'Performance Benchmarks',
};

const SEVERITY_COLORS: Record<string, { color: string; bg: string }> = {
  critical: { color: tokens.colors.error, bg: tokens.colors.errorSubtle },
  high: { color: tokens.colors.warning, bg: tokens.colors.warningSubtle },
  medium: { color: tokens.colors.primary, bg: tokens.colors.primarySubtle },
  low: { color: tokens.colors.secondary, bg: 'rgba(146, 155, 172, 0.1)' },
};

export const ScenarioCatalogAccordion: React.FC<ScenarioCatalogAccordionProps> = ({
  catalog,
}) => {
  const [search, setSearch] = useState('');
  const [selectedSuite, setSelectedSuite] = useState<string>('all');
  const [expandedSuite, setExpandedSuite] = useState<string | false>('reliability');

  const suiteKeys = useMemo(() => {
    return catalog ? Object.keys(catalog.suites) : ['reliability', 'recovery', 'security', 'agent', 'benchmarks'];
  }, [catalog]);

  const filteredSuites = useMemo(() => {
    if (!catalog) return {};

    const q = search.trim().toLowerCase();
    const result: Record<string, ScenarioCatalogItem[]> = {};

    for (const [suite, items] of Object.entries(catalog.suites)) {
      if (selectedSuite !== 'all' && selectedSuite !== suite) {
        continue;
      }

      const matches = items.filter((item) => {
        if (!q) return true;
        return (
          item.scenario_id.toLowerCase().includes(q) ||
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q))
        );
      });

      if (matches.length > 0) {
        result[suite] = matches;
      }
    }

    return result;
  }, [catalog, search, selectedSuite]);

  return (
    <Box>
      {/* Controls: Search and Suite Filter Tabs */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', md: 'center' },
          mb: 3,
        }}
      >
        <Tabs
          value={selectedSuite}
          onChange={(_, val) => setSelectedSuite(val)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              py: 0.5,
              px: 2,
              fontSize: tokens.typography.fontSize.sm,
              fontWeight: 500,
              textTransform: 'capitalize',
              color: tokens.colors.textMuted,
              '&.Mui-selected': {
                color: tokens.colors.primary,
                fontWeight: 600,
              },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: tokens.colors.primary,
            },
          }}
        >
          <Tab value="all" label="All Suites" />
          {suiteKeys.map((suite) => (
            <Tab
              key={suite}
              value={suite}
              label={SUITE_TITLES[suite] || suite}
              icon={SUITE_ICONS[suite]}
              iconPosition="start"
            />
          ))}
        </Tabs>

        <TextField
          size="small"
          placeholder="Filter scenarios by name, ID, or tag..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search size={16} color={tokens.colors.textMuted} />
              </InputAdornment>
            ),
          }}
          sx={{
            minWidth: { xs: '100%', md: 320 },
            '& .MuiOutlinedInput-root': {
              backgroundColor: tokens.colors.surfacePrimary,
              color: tokens.colors.textPrimary,
              fontSize: tokens.typography.fontSize.sm,
              '& fieldset': { borderColor: tokens.colors.border },
              '&:hover fieldset': { borderColor: tokens.colors.borderHover },
              '&.Mui-focused fieldset': { borderColor: tokens.colors.primary },
            },
          }}
        />
      </Box>

      {/* Suites Accordion */}
      {Object.keys(filteredSuites).length === 0 ? (
        <Box
          sx={{
            py: 6,
            textAlign: 'center',
            backgroundColor: tokens.colors.surfacePrimary,
            borderRadius: `${tokens.borderRadius.md}px`,
            border: `1px dashed ${tokens.colors.border}`,
          }}
        >
          <Typography sx={{ color: tokens.colors.textMuted, fontSize: tokens.typography.fontSize.sm }}>
            No evaluation scenarios match the search query "{search}".
          </Typography>
        </Box>
      ) : (
        Object.entries(filteredSuites).map(([suite, scenarios]) => {
          const isExpanded = expandedSuite === suite || (selectedSuite !== 'all' && selectedSuite === suite);

          return (
            <Accordion
              key={suite}
              expanded={isExpanded}
              onChange={(_, expanded) => setExpandedSuite(expanded ? suite : false)}
              sx={{
                mb: 2,
                backgroundColor: tokens.colors.surfacePrimary,
                border: `1px solid ${tokens.colors.border}`,
                borderRadius: `${tokens.borderRadius.md}px !important`,
                '&:before': { display: 'none' },
                overflow: 'hidden',
              }}
            >
              <AccordionSummary
                expandIcon={<ChevronDown size={18} color={tokens.colors.textMuted} />}
                sx={{
                  px: 2.5,
                  py: 1,
                  backgroundColor: tokens.colors.surfaceElevated,
                  '&:hover': { backgroundColor: tokens.colors.surfaceSubtle },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}>
                  <Box sx={{ color: tokens.colors.primary, display: 'flex', alignItems: 'center' }}>
                    {SUITE_ICONS[suite] || <Shield size={16} />}
                  </Box>
                  <Typography
                    sx={{
                      fontWeight: 600,
                      fontSize: tokens.typography.fontSize.base,
                      color: tokens.colors.textPrimary,
                    }}
                  >
                    {SUITE_TITLES[suite] || suite.toUpperCase()}
                  </Typography>
                  <Chip
                    size="small"
                    label={`${scenarios.length} scenarios`}
                    sx={{
                      ml: 1,
                      height: 22,
                      fontSize: tokens.typography.fontSize.xs,
                      fontWeight: 500,
                      backgroundColor: 'rgba(124, 140, 255, 0.12)',
                      color: tokens.colors.primaryLight,
                      border: `1px solid rgba(124, 140, 255, 0.25)`,
                    }}
                  />
                </Box>
              </AccordionSummary>

              <AccordionDetails sx={{ p: 2.5, pt: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {scenarios.map((scenario) => {
                    const sevStyle = SEVERITY_COLORS[scenario.severity.toLowerCase()] || SEVERITY_COLORS.medium;

                    return (
                      <Box
                        key={scenario.scenario_id}
                        sx={{
                          p: 2,
                          backgroundColor: tokens.colors.surfaceSubtle,
                          border: `1px solid ${tokens.colors.borderSubtle}`,
                          borderRadius: `${tokens.borderRadius.sm}px`,
                          transition: tokens.transitions.fast,
                          '&:hover': {
                            borderColor: tokens.colors.borderHover,
                            backgroundColor: tokens.colors.surfaceElevated,
                          },
                        }}
                      >
                        {/* Top row: ID, Name, Severity, Category */}
                        <Box
                          sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                            mb: 1,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Typography
                              component="span"
                              sx={{
                                fontFamily: tokens.typography.fontFamily.mono,
                                fontSize: tokens.typography.fontSize.xs,
                                color: tokens.colors.primaryLight,
                                px: 1,
                                py: 0.25,
                                backgroundColor: 'rgba(124, 140, 255, 0.1)',
                                borderRadius: `${tokens.borderRadius.xs}px`,
                                border: `1px solid rgba(124, 140, 255, 0.2)`,
                              }}
                            >
                              {scenario.scenario_id}
                            </Typography>
                            <Typography
                              sx={{
                                fontWeight: 600,
                                fontSize: tokens.typography.fontSize.sm,
                                color: tokens.colors.textPrimary,
                              }}
                            >
                              {scenario.name}
                            </Typography>
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                              size="small"
                              label={scenario.severity.toUpperCase()}
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: sevStyle.color,
                                backgroundColor: sevStyle.bg,
                                border: `1px solid ${sevStyle.color}40`,
                              }}
                            />
                            <Chip
                              size="small"
                              label={scenario.category}
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                color: tokens.colors.textMuted,
                                backgroundColor: 'rgba(146, 155, 172, 0.08)',
                                border: `1px solid ${tokens.colors.border}`,
                              }}
                            />
                          </Box>
                        </Box>

                        {/* Description */}
                        <Typography
                          sx={{
                            color: tokens.colors.textMuted,
                            fontSize: tokens.typography.fontSize.sm,
                            lineHeight: 1.5,
                            mb: scenario.tags.length > 0 ? 1.5 : 0,
                          }}
                        >
                          {scenario.description}
                        </Typography>

                        {/* Tags */}
                        {scenario.tags.length > 0 && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                            {scenario.tags.map((tag) => (
                              <Typography
                                key={tag}
                                component="span"
                                sx={{
                                  fontSize: tokens.typography.fontSize.xs,
                                  color: tokens.colors.textSubtle,
                                  px: 0.75,
                                  py: 0.2,
                                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                  borderRadius: `${tokens.borderRadius.xs}px`,
                                  border: `1px solid ${tokens.colors.borderSubtle}`,
                                }}
                              >
                                #{tag}
                              </Typography>
                            ))}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </AccordionDetails>
            </Accordion>
          );
        })
      )}
    </Box>
  );
};
