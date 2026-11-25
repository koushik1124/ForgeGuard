import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  Alert,
} from '@mui/material';
import {
  ChevronDown,
  Search,
  CheckCircle,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { EvaluationScenarioResult } from '../../api/types';
import { StatusBadge } from '../common/StatusBadge';

interface ScenarioResultsListProps {
  scenarioResults: EvaluationScenarioResult[];
}

export const ScenarioResultsList: React.FC<ScenarioResultsListProps> = ({
  scenarioResults,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | false>(false);

  const filteredResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scenarioResults.filter((s) => {
      const matchesStatus =
        filterStatus === 'all' || s.status.toLowerCase() === filterStatus.toLowerCase();

      const matchesSearch =
        !q ||
        s.scenario_id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.failure_reason && s.failure_reason.toLowerCase().includes(q));

      return matchesStatus && matchesSearch;
    });
  }, [scenarioResults, filterStatus, search]);

  const counts = useMemo(() => {
    let pass = 0;
    let fail = 0;
    let error = 0;
    for (const s of scenarioResults) {
      if (s.status === 'pass') pass++;
      else if (s.status === 'fail') fail++;
      else error++;
    }
    return { all: scenarioResults.length, pass, fail, error };
  }, [scenarioResults]);

  return (
    <Box>
      {/* Controls: Filter Tabs and Search */}
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
          value={filterStatus}
          onChange={(_, val) => setFilterStatus(val)}
          sx={{
            minHeight: 36,
            '& .MuiTab-root': {
              minHeight: 36,
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
          <Tab value="all" label={`All (${counts.all})`} />
          <Tab value="pass" label={`Passed (${counts.pass})`} />
          <Tab value="fail" label={`Failed (${counts.fail})`} />
          {counts.error > 0 && <Tab value="error" label={`Errors (${counts.error})`} />}
        </Tabs>

        <TextField
          size="small"
          placeholder="Search scenarios or failure messages..."
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

      {/* Scenarios Accordion List */}
      {filteredResults.length === 0 ? (
        <Box
          sx={{
            py: 5,
            textAlign: 'center',
            backgroundColor: tokens.colors.surfacePrimary,
            borderRadius: `${tokens.borderRadius.md}px`,
            border: `1px dashed ${tokens.colors.border}`,
          }}
        >
          <Typography sx={{ color: tokens.colors.textMuted, fontSize: tokens.typography.fontSize.sm }}>
            No scenario execution results match the active filter criteria.
          </Typography>
        </Box>
      ) : (
        filteredResults.map((scenario) => {
          const isPassed = scenario.status === 'pass';
          const isExpanded = expandedId === scenario.scenario_id;
          const passedCount = scenario.assertions_passed ?? scenario.assertions.filter((a) => a.passed).length;
          const totalAssertions = scenario.assertions.length;

          return (
            <Accordion
              key={scenario.scenario_id}
              expanded={isExpanded}
              onChange={(_, expanded) => setExpandedId(expanded ? scenario.scenario_id : false)}
              sx={{
                mb: 1.5,
                backgroundColor: tokens.colors.surfacePrimary,
                border: `1px solid ${isPassed ? tokens.colors.border : 'rgba(241, 108, 120, 0.4)'}`,
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
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    pr: 1.5,
                    gap: 1.5,
                  }}
                >
                  {/* Left: Status icon, ID, Name */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    {isPassed ? (
                      <CheckCircle size={18} color={tokens.colors.success} />
                    ) : (
                      <AlertCircle size={18} color={tokens.colors.error} />
                    )}

                    <Typography
                      component="span"
                      sx={{
                        fontFamily: tokens.typography.fontFamily.mono,
                        fontSize: tokens.typography.fontSize.xs,
                        color: tokens.colors.primaryLight,
                        px: 1,
                        py: 0.2,
                        backgroundColor: 'rgba(124, 140, 255, 0.1)',
                        borderRadius: `${tokens.borderRadius.xs}px`,
                        border: '1px solid rgba(124, 140, 255, 0.2)',
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

                  {/* Right: Category, Severity, Duration, Assertions */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Chip
                      size="small"
                      label={scenario.category}
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        backgroundColor: 'rgba(146, 155, 172, 0.08)',
                        color: tokens.colors.textMuted,
                        border: `1px solid ${tokens.colors.border}`,
                      }}
                    />

                    <Typography
                      sx={{
                        fontFamily: tokens.typography.fontFamily.mono,
                        fontSize: tokens.typography.fontSize.xs,
                        color: isPassed ? tokens.colors.success : tokens.colors.error,
                        fontWeight: 600,
                      }}
                    >
                      {passedCount}/{totalAssertions} assertions
                    </Typography>

                    <Typography
                      sx={{
                        fontFamily: tokens.typography.fontFamily.mono,
                        fontSize: tokens.typography.fontSize.xs,
                        color: tokens.colors.textMuted,
                      }}
                    >
                      {scenario.duration_ms.toFixed(1)}ms
                    </Typography>

                    <StatusBadge status={scenario.status} size="small" />
                  </Box>
                </Box>
              </AccordionSummary>

              <AccordionDetails sx={{ p: 2.5, backgroundColor: tokens.colors.surfaceSubtle }}>
                {/* Failure Reason Alert */}
                {scenario.failure_reason && (
                  <Alert
                    severity="error"
                    icon={<XCircle size={18} />}
                    sx={{
                      mb: 2,
                      backgroundColor: tokens.colors.errorSubtle,
                      color: tokens.colors.textPrimary,
                      border: `1px solid rgba(241, 108, 120, 0.3)`,
                      fontSize: tokens.typography.fontSize.sm,
                    }}
                  >
                    <Typography sx={{ fontWeight: 600, fontSize: tokens.typography.fontSize.sm, mb: 0.5 }}>
                      Failure Reason:
                    </Typography>
                    <Typography sx={{ fontFamily: tokens.typography.fontFamily.mono, fontSize: tokens.typography.fontSize.xs }}>
                      {scenario.failure_reason}
                    </Typography>
                  </Alert>
                )}

                {/* Assertions Breakdown */}
                <Typography sx={{ fontWeight: 600, fontSize: tokens.typography.fontSize.sm, color: tokens.colors.textPrimary, mb: 1.5 }}>
                  Assertions Breakdown ({totalAssertions})
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                  {scenario.assertions.map((assertion, idx) => (
                    <Box
                      key={`${assertion.name}-${idx}`}
                      sx={{
                        p: 1.5,
                        backgroundColor: tokens.colors.surfacePrimary,
                        border: `1px solid ${assertion.passed ? tokens.colors.borderSubtle : 'rgba(241, 108, 120, 0.3)'}`,
                        borderRadius: `${tokens.borderRadius.sm}px`,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {assertion.passed ? (
                            <CheckCircle size={15} color={tokens.colors.success} />
                          ) : (
                            <AlertCircle size={15} color={tokens.colors.error} />
                          )}
                          <Typography
                            sx={{
                              fontFamily: tokens.typography.fontFamily.mono,
                              fontWeight: 600,
                              fontSize: tokens.typography.fontSize.xs,
                              color: assertion.passed ? tokens.colors.textPrimary : tokens.colors.error,
                            }}
                          >
                            {assertion.name}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={assertion.passed ? 'PASSED' : 'FAILED'}
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            backgroundColor: assertion.passed
                              ? 'rgba(53, 201, 138, 0.12)'
                              : 'rgba(241, 108, 120, 0.12)',
                            color: assertion.passed ? tokens.colors.success : tokens.colors.error,
                            border: `1px solid ${assertion.passed ? tokens.colors.success : tokens.colors.error}40`,
                          }}
                        />
                      </Box>

                      {assertion.message && assertion.message !== 'Passed' && (
                        <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textMuted, mb: 0.5 }}>
                          {assertion.message}
                        </Typography>
                      )}

                      {!assertion.passed && (
                        <Box
                          sx={{
                            mt: 1,
                            p: 1,
                            backgroundColor: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: `${tokens.borderRadius.xs}px`,
                            fontFamily: tokens.typography.fontFamily.mono,
                            fontSize: tokens.typography.fontSize.xs,
                          }}
                        >
                          <Typography sx={{ color: tokens.colors.textMuted, fontSize: '0.7rem' }}>
                            Expected: <Box component="span" sx={{ color: tokens.colors.success }}>{String(JSON.stringify(assertion.expected))}</Box>
                          </Typography>
                          <Typography sx={{ color: tokens.colors.textMuted, fontSize: '0.7rem' }}>
                            Actual: <Box component="span" sx={{ color: tokens.colors.error }}>{String(JSON.stringify(assertion.actual))}</Box>
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>

                {/* Diagnostics If Any */}
                {scenario.diagnostics && scenario.diagnostics.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: tokens.typography.fontSize.sm, color: tokens.colors.textPrimary, mb: 1 }}>
                      Emitted Diagnostics ({scenario.diagnostics.length})
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {scenario.diagnostics.map((diag, dIdx) => (
                        <Box
                          key={dIdx}
                          sx={{
                            p: 1.25,
                            backgroundColor: tokens.colors.surfacePrimary,
                            border: `1px solid ${tokens.colors.border}`,
                            borderRadius: `${tokens.borderRadius.sm}px`,
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography
                              component="span"
                              sx={{
                                fontFamily: tokens.typography.fontFamily.mono,
                                fontSize: tokens.typography.fontSize.xs,
                                color: tokens.colors.warning,
                                fontWeight: 600,
                              }}
                            >
                              {String(diag.code || 'DIAGNOSTIC')}
                            </Typography>
                            <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textPrimary }}>
                              {String(diag.message || '')}
                            </Typography>
                          </Box>
                          {Boolean(diag.suggested_action) && (
                            <Typography sx={{ fontSize: '0.7rem', color: tokens.colors.textMuted }}>
                              Suggested Action: {String(diag.suggested_action)}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          );
        })
      )}
    </Box>
  );
};
