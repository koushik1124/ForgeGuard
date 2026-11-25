import React, { useState, useEffect, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Play,
  Shield,
  ShieldCheck,
  RefreshCw,
  Lock,
  Bot,
  Gauge,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  FlaskConical,
} from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { useStartEvaluationRun } from '../../api/hooks';
import { APIClientError } from '../../api/client';
import { ScenarioCatalogItem, ScenarioCatalogResponse } from '../../api/types';

export interface RunEvaluationDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (runId: string) => void;
  catalog?: ScenarioCatalogResponse;
  isAnyRunActive?: boolean;
}

const SUITE_ICONS: Record<string, React.ReactElement> = {
  reliability: <Shield size={16} />,
  recovery: <RefreshCw size={16} />,
  security: <Lock size={16} />,
  agent: <Bot size={16} />,
  benchmarks: <Gauge size={16} />,
};

const SUITE_LABELS: Record<string, string> = {
  reliability: 'Reliability & Invariants',
  recovery: 'Recovery & Durability',
  security: 'Security & Sandboxing',
  agent: 'Agent Reasoning',
  benchmarks: 'Performance Benchmarks',
};

const DEFAULT_SUITES = ['reliability', 'recovery', 'security', 'agent', 'benchmarks'];

export const RunEvaluationDialog: React.FC<RunEvaluationDialogProps> = ({
  open,
  onClose,
  onSuccess,
  catalog,
  isAnyRunActive = false,
}) => {
  const [name, setName] = useState('forgeguard_evaluation');
  const [selectedPreset, setSelectedPreset] = useState<'all' | 'invariants' | 'benchmarks' | 'custom'>('all');
  const [selectedSuites, setSelectedSuites] = useState<Record<string, boolean>>({
    reliability: true,
    recovery: true,
    security: true,
    agent: true,
    benchmarks: true,
  });
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<Set<string>>(new Set());
  const [expandedSuites, setExpandedSuites] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const startMutation = useStartEvaluationRun();

  // Populate initial scenario IDs when catalog loads or modal opens
  useEffect(() => {
    if (open && catalog?.scenarios) {
      setSelectedScenarioIds(new Set(catalog.scenarios.map((s) => s.scenario_id)));
    }
  }, [open, catalog]);

  const allScenarios = useMemo(() => catalog?.scenarios || [], [catalog]);

  const suiteScenarios = useMemo(() => {
    if (!catalog?.suites) return {};
    return catalog.suites;
  }, [catalog]);

  // Apply Presets
  const applyPreset = (preset: 'all' | 'invariants' | 'benchmarks') => {
    setSelectedPreset(preset);
    setErrorMessage(null);

    if (preset === 'all') {
      const allSuiteMap: Record<string, boolean> = {};
      DEFAULT_SUITES.forEach((s) => (allSuiteMap[s] = true));
      setSelectedSuites(allSuiteMap);
      setSelectedScenarioIds(new Set(allScenarios.map((s) => s.scenario_id)));
    } else if (preset === 'invariants') {
      const invSuites = ['reliability', 'recovery', 'security'];
      const invMap: Record<string, boolean> = {
        reliability: true,
        recovery: true,
        security: true,
        agent: false,
        benchmarks: false,
      };
      setSelectedSuites(invMap);
      const invIds = allScenarios
        .filter((s) => invSuites.includes(s.category.toLowerCase()))
        .map((s) => s.scenario_id);
      setSelectedScenarioIds(new Set(invIds));
    } else if (preset === 'benchmarks') {
      const benchMap: Record<string, boolean> = {
        reliability: false,
        recovery: false,
        security: false,
        agent: false,
        benchmarks: true,
      };
      setSelectedSuites(benchMap);
      const benchIds = allScenarios
        .filter((s) => s.category.toLowerCase() === 'benchmark' || s.category.toLowerCase() === 'benchmarks')
        .map((s) => s.scenario_id);
      setSelectedScenarioIds(new Set(benchIds));
    }
  };

  const handleSuiteToggle = (suite: string, checked: boolean) => {
    setSelectedPreset('custom');
    setErrorMessage(null);

    const updatedSuites = { ...selectedSuites, [suite]: checked };
    setSelectedSuites(updatedSuites);

    const scenariosInSuite = suiteScenarios[suite] || [];
    const updatedIds = new Set(selectedScenarioIds);

    scenariosInSuite.forEach((sc) => {
      if (checked) {
        updatedIds.add(sc.scenario_id);
      } else {
        updatedIds.delete(sc.scenario_id);
      }
    });

    setSelectedScenarioIds(updatedIds);
  };

  const handleScenarioToggle = (scenarioId: string, suite: string, checked: boolean) => {
    setSelectedPreset('custom');
    setErrorMessage(null);

    const updatedIds = new Set(selectedScenarioIds);
    if (checked) {
      updatedIds.add(scenarioId);
    } else {
      updatedIds.delete(scenarioId);
    }
    setSelectedScenarioIds(updatedIds);

    // Sync suite checkbox: if at least one scenario is selected, suite is checked
    const scenariosInSuite = suiteScenarios[suite] || [];
    const anySelected = scenariosInSuite.some((sc) => updatedIds.has(sc.scenario_id));
    setSelectedSuites((prev) => ({ ...prev, [suite]: anySelected }));
  };

  const toggleSuiteAccordion = (suite: string) => {
    setExpandedSuites((prev) => ({ ...prev, [suite]: !prev[suite] }));
  };

  const totalSelectedCount = selectedScenarioIds.size;

  const handleClose = () => {
    if (startMutation.isPending) return;
    setErrorMessage(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalSelectedCount === 0 || isAnyRunActive) return;

    setErrorMessage(null);

    // If preset is 'all', we can pass suites: ['all'] or scenario_ids
    const scenarioIdsToRun = Array.from(selectedScenarioIds);

    try {
      const res = await startMutation.mutateAsync({
        name: name.trim() || 'forgeguard_evaluation',
        scenario_ids: scenarioIdsToRun,
      });

      onSuccess(res.run_id);
      onClose();
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to launch evaluation run.');
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: tokens.colors.surfaceElevated,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: 2,
          color: tokens.colors.textPrimary,
        },
      }}
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pt: 2.5,
            px: 3,
            pb: 1.5,
            borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1,
                backgroundColor: tokens.colors.primarySubtle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: tokens.colors.primary,
              }}
            >
              <FlaskConical size={18} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 600, fontSize: tokens.typography.fontSize.md }}>
                Launch Evaluation Run
              </Typography>
              <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textMuted }}>
                Execute deterministic verification suites against isolated ForgeGuard sandboxes
              </Typography>
            </Box>
          </Stack>
        </DialogTitle>

        <DialogContent sx={{ px: 3, py: 2.5 }}>
          <Stack spacing={2.5}>
            {/* Concurrency Banner */}
            {isAnyRunActive && (
              <Alert
                severity="warning"
                icon={<AlertCircle size={18} />}
                sx={{
                  backgroundColor: tokens.colors.warningSubtle,
                  color: tokens.colors.warning,
                  border: `1px solid rgba(240, 180, 90, 0.3)`,
                  fontSize: tokens.typography.fontSize.sm,
                  '& .MuiAlert-icon': { color: tokens.colors.warning },
                }}
              >
                An evaluation run is currently active. ForgeGuard enforces a strict limit of 1 concurrent active run.
                Please wait for the current run to complete.
              </Alert>
            )}

            {errorMessage && (
              <Alert
                severity="error"
                sx={{
                  backgroundColor: tokens.colors.errorSubtle,
                  color: tokens.colors.error,
                  border: `1px solid rgba(241, 108, 120, 0.3)`,
                  fontSize: tokens.typography.fontSize.sm,
                }}
              >
                {errorMessage}
              </Alert>
            )}

            {/* Run Name */}
            <Box>
              <Typography sx={{ fontSize: tokens.typography.fontSize.xs, fontWeight: 600, color: tokens.colors.textMuted, mb: 0.75 }}>
                RUN IDENTIFIER / NAME
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="forgeguard_evaluation"
                disabled={isAnyRunActive || startMutation.isPending}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: tokens.colors.surfacePrimary,
                    borderColor: tokens.colors.border,
                    color: tokens.colors.textPrimary,
                    fontFamily: tokens.fonts.mono,
                    fontSize: tokens.typography.fontSize.sm,
                    '&:hover fieldset': { borderColor: tokens.colors.borderHover },
                    '&.Mui-focused fieldset': { borderColor: tokens.colors.primary },
                  },
                }}
              />
            </Box>

            {/* Preset Selection */}
            <Box>
              <Typography sx={{ fontSize: tokens.typography.fontSize.xs, fontWeight: 600, color: tokens.colors.textMuted, mb: 1 }}>
                SUITE PRESETS
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  label="All Scenarios (20)"
                  onClick={() => applyPreset('all')}
                  variant={selectedPreset === 'all' ? 'filled' : 'outlined'}
                  sx={{
                    backgroundColor: selectedPreset === 'all' ? tokens.colors.primary : 'transparent',
                    color: selectedPreset === 'all' ? '#0B0D12' : tokens.colors.textPrimary,
                    fontWeight: 600,
                    borderColor: tokens.colors.border,
                    cursor: 'pointer',
                  }}
                />
                <Chip
                  label="Core Invariants (14)"
                  onClick={() => applyPreset('invariants')}
                  variant={selectedPreset === 'invariants' ? 'filled' : 'outlined'}
                  sx={{
                    backgroundColor: selectedPreset === 'invariants' ? tokens.colors.primary : 'transparent',
                    color: selectedPreset === 'invariants' ? '#0B0D12' : tokens.colors.textPrimary,
                    fontWeight: 600,
                    borderColor: tokens.colors.border,
                    cursor: 'pointer',
                  }}
                />
                <Chip
                  label="Benchmarks Only (1)"
                  onClick={() => applyPreset('benchmarks')}
                  variant={selectedPreset === 'benchmarks' ? 'filled' : 'outlined'}
                  sx={{
                    backgroundColor: selectedPreset === 'benchmarks' ? tokens.colors.primary : 'transparent',
                    color: selectedPreset === 'benchmarks' ? '#0B0D12' : tokens.colors.textPrimary,
                    fontWeight: 600,
                    borderColor: tokens.colors.border,
                    cursor: 'pointer',
                  }}
                />
                {selectedPreset === 'custom' && (
                  <Chip
                    label="Custom Selection"
                    variant="outlined"
                    sx={{
                      borderColor: tokens.colors.primaryLight,
                      color: tokens.colors.primaryLight,
                      fontWeight: 600,
                    }}
                  />
                )}
              </Stack>
            </Box>

            {/* Suite & Granular Scenario Checklist */}
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography sx={{ fontSize: tokens.typography.fontSize.xs, fontWeight: 600, color: tokens.colors.textMuted }}>
                  SUITES & SCENARIO SELECTION
                </Typography>
                <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.primaryLight, fontWeight: 600 }}>
                  {totalSelectedCount} of {allScenarios.length} scenarios selected
                </Typography>
              </Stack>

              <Box
                sx={{
                  border: `1px solid ${tokens.colors.border}`,
                  borderRadius: 1.5,
                  backgroundColor: tokens.colors.surfacePrimary,
                  p: 1.5,
                  maxHeight: 280,
                  overflowY: 'auto',
                }}
              >
                <Stack spacing={1}>
                  {DEFAULT_SUITES.map((suiteKey) => {
                    const scenarios = suiteScenarios[suiteKey] || [];
                    const isSuiteChecked = !!selectedSuites[suiteKey];
                    const selectedInSuite = scenarios.filter((s) => selectedScenarioIds.has(s.scenario_id)).length;
                    const isExpanded = !!expandedSuites[suiteKey];

                    return (
                      <Box
                        key={suiteKey}
                        sx={{
                          border: `1px solid ${tokens.colors.borderSubtle}`,
                          borderRadius: 1,
                          backgroundColor: tokens.colors.surfaceSubtle,
                          overflow: 'hidden',
                        }}
                      >
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          sx={{ px: 1.5, py: 0.75 }}
                        >
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <IconButton
                              size="small"
                              onClick={() => toggleSuiteAccordion(suiteKey)}
                              sx={{ color: tokens.colors.textMuted, p: 0.5 }}
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </IconButton>
                            <Box sx={{ color: tokens.colors.primary, display: 'flex', alignItems: 'center' }}>
                              {SUITE_ICONS[suiteKey]}
                            </Box>
                            <FormControlLabel
                              control={
                                <Checkbox
                                  size="small"
                                  checked={isSuiteChecked}
                                  indeterminate={selectedInSuite > 0 && selectedInSuite < scenarios.length}
                                  onChange={(e) => handleSuiteToggle(suiteKey, e.target.checked)}
                                  sx={{
                                    color: tokens.colors.borderHover,
                                    '&.Mui-checked, &.MuiCheckbox-indeterminate': {
                                      color: tokens.colors.primary,
                                    },
                                  }}
                                />
                              }
                              label={
                                <Typography sx={{ fontSize: tokens.typography.fontSize.sm, fontWeight: 500 }}>
                                  {SUITE_LABELS[suiteKey] || suiteKey}
                                </Typography>
                              }
                              sx={{ m: 0 }}
                            />
                          </Stack>
                          <Chip
                            size="small"
                            label={`${selectedInSuite} / ${scenarios.length}`}
                            sx={{
                              backgroundColor: selectedInSuite > 0 ? tokens.colors.primarySubtle : 'transparent',
                              color: selectedInSuite > 0 ? tokens.colors.primaryLight : tokens.colors.textMuted,
                              fontSize: tokens.typography.fontSize.xs,
                              fontFamily: tokens.fonts.mono,
                            }}
                          />
                        </Stack>

                        <Collapse in={isExpanded}>
                          <Divider sx={{ borderColor: tokens.colors.borderSubtle }} />
                          <Box sx={{ px: 3, py: 1, backgroundColor: tokens.colors.surfacePrimary }}>
                            <Stack spacing={0.5}>
                              {scenarios.map((sc: ScenarioCatalogItem) => {
                                const isScChecked = selectedScenarioIds.has(sc.scenario_id);
                                return (
                                  <Stack
                                    key={sc.scenario_id}
                                    direction="row"
                                    alignItems="center"
                                    justifyContent="space-between"
                                  >
                                    <FormControlLabel
                                      control={
                                        <Checkbox
                                          size="small"
                                          checked={isScChecked}
                                          onChange={(e) => handleScenarioToggle(sc.scenario_id, suiteKey, e.target.checked)}
                                          sx={{
                                            p: 0.5,
                                            color: tokens.colors.borderHover,
                                            '&.Mui-checked': { color: tokens.colors.primary },
                                          }}
                                        />
                                      }
                                      label={
                                        <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textPrimary }}>
                                          {sc.name}
                                        </Typography>
                                      }
                                      sx={{ m: 0 }}
                                    />
                                    <Typography
                                      sx={{
                                        fontSize: '0.7rem',
                                        fontFamily: tokens.fonts.mono,
                                        color: tokens.colors.textMuted,
                                      }}
                                    >
                                      {sc.scenario_id}
                                    </Typography>
                                  </Stack>
                                );
                              })}
                            </Stack>
                          </Box>
                        </Collapse>
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            </Box>

            {/* Sandbox Isolation Assurance Callout */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                backgroundColor: tokens.colors.primarySubtle,
                border: '1px solid rgba(124, 140, 255, 0.25)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.25,
              }}
            >
              <ShieldCheck size={18} color={tokens.colors.primary} style={{ marginTop: 2, flexShrink: 0 }} />
              <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textPrimary, lineHeight: 1.5 }}>
                <strong>Strict Sandbox Isolation:</strong> Every scenario executes inside an isolated, temporary directory with an ephemeral SQLite database that is automatically destroyed upon completion. User workspaces and production tasks are strictly untouched.
              </Typography>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, borderTop: `1px solid ${tokens.colors.borderSubtle}` }}>
          <Button
            onClick={handleClose}
            disabled={startMutation.isPending}
            sx={{
              color: tokens.colors.textMuted,
              textTransform: 'none',
              fontSize: tokens.typography.fontSize.sm,
              '&:hover': { color: tokens.colors.textPrimary },
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={totalSelectedCount === 0 || isAnyRunActive || startMutation.isPending}
            startIcon={
              startMutation.isPending ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )
            }
            sx={{
              backgroundColor: tokens.colors.primary,
              color: '#0B0D12',
              fontWeight: 600,
              textTransform: 'none',
              fontSize: tokens.typography.fontSize.sm,
              px: 2.5,
              '&:hover': {
                backgroundColor: tokens.colors.primaryHover,
              },
              '&.Mui-disabled': {
                backgroundColor: tokens.colors.surfaceSubtle,
                color: tokens.colors.textMuted,
              },
            }}
          >
            {startMutation.isPending ? 'Starting Run...' : `Start Evaluation (${totalSelectedCount})`}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
