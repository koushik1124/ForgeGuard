import React from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
} from '@mui/material';
import { Gauge } from 'lucide-react';
import { tokens } from '../../theme/tokens';
import { EvaluationBenchmarkResult } from '../../api/types';

interface BenchmarkMetricsTableProps {
  benchmarks: EvaluationBenchmarkResult[];
}

export const BenchmarkMetricsTable: React.FC<BenchmarkMetricsTableProps> = ({
  benchmarks,
}) => {
  if (!benchmarks || benchmarks.length === 0) {
    return (
      <Box
        sx={{
          py: 4,
          textAlign: 'center',
          backgroundColor: tokens.colors.surfacePrimary,
          borderRadius: `${tokens.borderRadius.md}px`,
          border: `1px dashed ${tokens.colors.border}`,
        }}
      >
        <Typography sx={{ color: tokens.colors.textMuted, fontSize: tokens.typography.fontSize.sm }}>
          No performance benchmark results recorded for this evaluation experiment.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Gauge size={20} color={tokens.colors.primary} />
        <Typography sx={{ fontWeight: 600, fontSize: tokens.typography.fontSize.md, color: tokens.colors.textPrimary }}>
          Performance Benchmarks & Governance Overhead
        </Typography>
        <Chip
          size="small"
          label={`${benchmarks.length} workloads`}
          sx={{
            height: 20,
            fontSize: tokens.typography.fontSize.xs,
            backgroundColor: 'rgba(124, 140, 255, 0.1)',
            color: tokens.colors.primaryLight,
            border: '1px solid rgba(124, 140, 255, 0.25)',
          }}
        />
      </Box>

      <TableContainer
        component={Paper}
        sx={{
          backgroundColor: tokens.colors.surfacePrimary,
          border: `1px solid ${tokens.colors.border}`,
          borderRadius: `${tokens.borderRadius.md}px`,
          overflow: 'hidden',
        }}
      >
        <Table size="small">
          <TableHead sx={{ backgroundColor: tokens.colors.surfaceElevated }}>
            <TableRow>
              <TableCell sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                BENCHMARK ID
              </TableCell>
              <TableCell sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                WORKLOAD / STAGE
              </TableCell>
              <TableCell align="right" sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                SAMPLES
              </TableCell>
              <TableCell align="right" sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                MEAN (MS)
              </TableCell>
              <TableCell align="right" sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                MEDIAN (MS)
              </TableCell>
              <TableCell align="right" sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                P95 (MS)
              </TableCell>
              <TableCell align="right" sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                MIN / MAX (MS)
              </TableCell>
              <TableCell align="right" sx={{ color: tokens.colors.textMuted, fontWeight: 600, fontSize: tokens.typography.fontSize.xs, py: 1.5 }}>
                OVERHEAD VS BASELINE
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {benchmarks.map((b) => {
              const isBaseline = b.relative_overhead_pct === null || b.relative_overhead_pct === undefined;
              const overheadDisplay = isBaseline
                ? 'Baseline (0%)'
                : `+${b.relative_overhead_pct?.toFixed(2)}%`;

              return (
                <TableRow
                  key={b.benchmark_id}
                  hover
                  sx={{
                    '&:hover': { backgroundColor: tokens.colors.surfaceSubtle },
                    borderBottom: `1px solid ${tokens.colors.borderSubtle}`,
                  }}
                >
                  <TableCell sx={{ py: 1.5 }}>
                    <Typography
                      component="span"
                      sx={{
                        fontFamily: tokens.typography.fontFamily.mono,
                        fontSize: tokens.typography.fontSize.xs,
                        color: tokens.colors.primaryLight,
                      }}
                    >
                      {b.benchmark_id}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ py: 1.5 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 600, fontSize: tokens.typography.fontSize.sm, color: tokens.colors.textPrimary }}>
                        {b.name}
                      </Typography>
                      <Typography sx={{ fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textMuted }}>
                        {b.workload_type}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 1.5 }}>
                    <Typography sx={{ fontFamily: tokens.typography.fontFamily.mono, fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textMuted }}>
                      {b.sample_count}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 1.5 }}>
                    <Typography sx={{ fontFamily: tokens.typography.fontFamily.mono, fontSize: tokens.typography.fontSize.xs, fontWeight: 600, color: tokens.colors.textPrimary }}>
                      {b.mean_ms.toFixed(4)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 1.5 }}>
                    <Typography sx={{ fontFamily: tokens.typography.fontFamily.mono, fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textPrimary }}>
                      {b.median_ms.toFixed(4)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 1.5 }}>
                    <Typography sx={{ fontFamily: tokens.typography.fontFamily.mono, fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textPrimary }}>
                      {b.p95_ms.toFixed(4)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 1.5 }}>
                    <Typography sx={{ fontFamily: tokens.typography.fontFamily.mono, fontSize: tokens.typography.fontSize.xs, color: tokens.colors.textMuted }}>
                      {b.min_ms.toFixed(4)} / {b.max_ms.toFixed(4)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 1.5 }}>
                    <Chip
                      size="small"
                      label={overheadDisplay}
                      sx={{
                        height: 22,
                        fontSize: tokens.typography.fontSize.xs,
                        fontWeight: 600,
                        backgroundColor: isBaseline
                          ? 'rgba(53, 201, 138, 0.12)'
                          : 'rgba(124, 140, 255, 0.12)',
                        color: isBaseline
                          ? tokens.colors.success
                          : tokens.colors.primaryLight,
                        border: isBaseline
                          ? `1px solid rgba(53, 201, 138, 0.25)`
                          : `1px solid rgba(124, 140, 255, 0.25)`,
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
