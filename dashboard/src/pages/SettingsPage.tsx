import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  Typography,
  Stack,
  Alert,
  IconButton,
  InputAdornment,
  Divider,
} from '@mui/material';
import { Eye, EyeOff, CheckCircle2, AlertCircle, RefreshCw, RotateCcw, ShieldCheck, KeyRound } from 'lucide-react';
import { z } from 'zod';
import { PageHeader } from '../components/common/PageHeader';
import { Panel } from '../components/common/Panel';
import { useConnectionStore } from '../stores/connectionStore';
import { useUIStore } from '../stores/uiStore';
import { apiClient } from '../api/client';
import { tokens } from '../theme/tokens';
import { ConnectionTestResult } from '../api/types';

const urlSchema = z.string().url('Must be a valid URL (e.g. http://127.0.0.1:8000)');

export const SettingsPage: React.FC = () => {
  const {
    baseUrl,
    apiKey,
    persistCredentials,
    setBaseUrl,
    setApiKey,
    setPersistCredentials,
    setConnectionState,
    setTestResult,
    resetDefaults,
  } = useConnectionStore();

  const { addToast } = useUIStore();

  const [inputUrl, setInputUrl] = useState(baseUrl);
  const [inputApiKey, setInputApiKey] = useState(apiKey);
  const [inputPersist, setInputPersist] = useState(persistCredentials);
  const [showApiKey, setShowApiKey] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testResultLocal, setTestResultLocal] = useState<ConnectionTestResult | null>(null);

  const validateUrl = (url: string): boolean => {
    const result = urlSchema.safeParse(url);
    if (!result.success) {
      setUrlError(result.error.errors[0]?.message || 'Invalid URL');
      return false;
    }
    setUrlError(null);
    return true;
  };

  const handleTestConnection = async () => {
    if (!validateUrl(inputUrl)) return;

    setIsTesting(true);
    setTestResultLocal(null);

    // Apply temporary values to client for testing
    apiClient.setBaseUrl(inputUrl);
    apiClient.setApiKey(inputApiKey);

    try {
      const result = await apiClient.testConnection();
      setTestResultLocal(result);
      setTestResult(result);

      if (result.success) {
        const state = result.readiness?.status === 'ready' ? 'connected' : 'degraded';
        setConnectionState(state);
        addToast({
          type: 'success',
          message: `Connected successfully to ForgeGuard runtime (${result.latencyMs}ms)`,
        });
      } else {
        setConnectionState('error');
        addToast({
          type: 'error',
          message: `Connection failed: ${result.error || result.errorMessage || 'Server unreachable'}`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const failResult: ConnectionTestResult = {
        success: false,
        state: 'error',
        latencyMs: 0,
        error: message,
        errorMessage: message,
        testedAt: new Date().toISOString(),
      };
      setTestResultLocal(failResult);
      setConnectionState('error');
      addToast({
        type: 'error',
        message: `Connection test error: ${message}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    if (!validateUrl(inputUrl)) return;

    setBaseUrl(inputUrl);
    setApiKey(inputApiKey);
    setPersistCredentials(inputPersist);

    addToast({
      type: 'success',
      message: 'Console configuration saved successfully.',
    });
  };

  const handleReset = () => {
    resetDefaults();
    setInputUrl('http://127.0.0.1:8000');
    setInputApiKey('');
    setInputPersist(false);
    setUrlError(null);
    setTestResultLocal(null);

    addToast({
      type: 'info',
      message: 'Configuration reset to default values.',
    });
  };

  return (
    <Box>
      <PageHeader
        title="Settings & Connectivity"
        description="Configure runtime API connection parameters, authentication tokens, and credential persistence."
      />

      <Stack spacing={3} sx={{ maxWidth: '800px' }}>
        {/* Runtime Connection Configuration */}
        <Panel
          title="Runtime API Connection"
          subtitle="Define the endpoint for the ForgeGuard M8 runtime service"
          headerRight={<ShieldCheck size={18} color={tokens.colors.accentPrimary} />}
        >
          <Stack spacing={2.5}>
            <Box>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.textPrimary, mb: 1 }}>
                API Base URL
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={inputUrl}
                onChange={(e) => {
                  setInputUrl(e.target.value);
                  if (urlError) validateUrl(e.target.value);
                }}
                onBlur={() => validateUrl(inputUrl)}
                error={Boolean(urlError)}
                helperText={urlError || 'Default local runtime endpoint: http://127.0.0.1:8000'}
                placeholder="http://127.0.0.1:8000"
                inputProps={{ 'aria-label': 'API Base URL' }}
                sx={{
                  '& .MuiInputBase-input': {
                    fontFamily: tokens.fonts.mono,
                    fontSize: '0.85rem',
                  },
                }}
              />
            </Box>

            <Box>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: tokens.colors.textPrimary, mb: 1 }}>
                API Access Key (Optional)
              </Typography>
              <TextField
                fullWidth
                size="small"
                type={showApiKey ? 'text' : 'password'}
                value={inputApiKey}
                onChange={(e) => setInputApiKey(e.target.value)}
                placeholder="Enter runtime API key if server authentication is enabled"
                inputProps={{ 'aria-label': 'API Access Key' }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <KeyRound size={16} color={tokens.colors.textSubtle} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowApiKey(!showApiKey)}
                        edge="end"
                        aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                        sx={{ color: tokens.colors.textMuted }}
                      >
                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                helperText="Corresponds to FORGEGUARD_API_KEY if configured in backend environment."
                sx={{
                  '& .MuiInputBase-input': {
                    fontFamily: tokens.fonts.mono,
                    fontSize: '0.85rem',
                  },
                }}
              />
            </Box>

            <Divider sx={{ borderColor: tokens.colors.borderSubtle }} />

            {/* Storage Persistence Preference */}
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={inputPersist}
                    onChange={(e) => setInputPersist(e.target.checked)}
                    sx={{
                      color: tokens.colors.textSubtle,
                      '&.Mui-checked': { color: tokens.colors.accentPrimary },
                    }}
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: tokens.colors.textPrimary }}>
                      Persist API key in browser storage
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: tokens.colors.textMuted }}>
                      When unchecked, credentials remain in memory only and are discarded on tab refresh.
                    </Typography>
                  </Box>
                }
              />
            </Box>

            {/* Connection Test Results */}
            {testResultLocal && (
              <Box sx={{ mt: 1 }}>
                {testResultLocal.success ? (
                  <Alert
                    severity="success"
                    icon={<CheckCircle2 size={18} />}
                    sx={{
                      backgroundColor: 'rgba(53, 201, 138, 0.1)',
                      color: tokens.colors.textPrimary,
                      border: `1px solid rgba(53, 201, 138, 0.3)`,
                      '& .MuiAlert-icon': { color: tokens.colors.accentSuccess },
                    }}
                  >
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>
                      Connection Succeeded ({testResultLocal.latencyMs}ms)
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', mt: 0.5, color: tokens.colors.textMuted }}>
                      ForgeGuard Version: {testResultLocal.health?.version || '0.1.0'} | Database:{' '}
                      {testResultLocal.readiness?.database ? 'Ready' : 'Degraded'} | Engine:{' '}
                      {testResultLocal.readiness?.engine ? 'Active' : 'Degraded'}
                    </Typography>
                  </Alert>
                ) : (
                  <Alert
                    severity="error"
                    icon={<AlertCircle size={18} />}
                    sx={{
                      backgroundColor: 'rgba(241, 108, 120, 0.1)',
                      color: tokens.colors.textPrimary,
                      border: `1px solid rgba(241, 108, 120, 0.3)`,
                      '& .MuiAlert-icon': { color: tokens.colors.accentError },
                    }}
                  >
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>Connection Failed</Typography>
                    <Typography sx={{ fontSize: '0.75rem', mt: 0.5, color: tokens.colors.textMuted }}>
                      {testResultLocal.error || testResultLocal.errorMessage || 'Server at specified base URL is unreachable.'}
                    </Typography>
                  </Alert>
                )}
              </Box>
            )}

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 1.5, pt: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                onClick={handleTestConnection}
                disabled={isTesting}
                startIcon={<RefreshCw size={15} className={isTesting ? 'animate-spin' : ''} />}
                sx={{
                  color: tokens.colors.textPrimary,
                  borderColor: tokens.colors.borderSubtle,
                  '&:hover': { borderColor: tokens.colors.borderInteractive },
                }}
              >
                {isTesting ? 'Testing...' : 'Test Connection'}
              </Button>

              <Button
                variant="contained"
                onClick={handleSave}
                sx={{
                  backgroundColor: tokens.colors.accentPrimary,
                  color: '#fff',
                  '&:hover': { backgroundColor: tokens.colors.accentPrimaryHover },
                }}
              >
                Save Configuration
              </Button>

              <Button
                variant="text"
                onClick={handleReset}
                startIcon={<RotateCcw size={15} />}
                sx={{ color: tokens.colors.textMuted, ml: 'auto' }}
              >
                Reset to Defaults
              </Button>
            </Box>
          </Stack>
        </Panel>

        {/* Runtime Architecture Reference */}
        <Panel title="Architecture Invariants" subtitle="Governed runtime principles">
          <Typography sx={{ fontSize: '0.8125rem', color: tokens.colors.textMuted, lineHeight: 1.6 }}>
            ForgeGuard enforces that every agent action passes through the same unified engine. The console interface
            communicates exclusively with the M8 REST API at the configured endpoint, maintaining default-deny security
            policies, resource budgets, and durable recovery checkpoints.
          </Typography>
        </Panel>
      </Stack>
    </Box>
  );
};
