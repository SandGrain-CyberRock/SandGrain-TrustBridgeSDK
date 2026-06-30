import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  Title,
  type TooltipItem,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { useGetDeviceStatusCounts } from '../../../Devices/service/Devices';
import { Spinner, Center, Text } from '@chakra-ui/react';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

export const DoughnutChart = () => {
  const { data: statusCounts, isLoading } = useGetDeviceStatusCounts();

  if (isLoading) {
    return (
      <Center h="300px">
        <Spinner size="lg" />
      </Center>
    );
  }

  const total = statusCounts?.total || 0;
  const idle = statusCounts?.idle || 0;
  const inprogress = statusCounts?.inprogress || 0;
  const claimed = statusCounts?.claimed || 0;
  const active = statusCounts?.active || 0;
  const inactive = statusCounts?.inactive || 0;
  const rejected = statusCounts?.rejected || 0;

  const chartValues = [idle, inprogress, claimed, active, inactive, rejected];
  const chartTotal = chartValues.reduce((sum, v) => sum + v, 0);

  const pct = (value: number) =>
    chartTotal > 0 ? ((value / chartTotal) * 100).toFixed(1) : '0.0';

  // Show empty state message when no devices
  if (total === 0 || chartTotal === 0) {
    return (
      <Center h="300px" flexDirection="column" gap={2}>
        <Text color="gray.500" fontSize="lg">
          No devices yet
        </Text>
        <Text color="gray.400" fontSize="sm">
          Add your first device to see the distribution
        </Text>
      </Center>
    );
  }

  const data = {
    labels: [
      `Idle (${pct(idle)}%)`,
      `In Progress (${pct(inprogress)}%)`,
      `Claimed (${pct(claimed)}%)`,
      `Active (${pct(active)}%)`,
      `Inactive (${pct(inactive)}%)`,
      `Rejected (${pct(rejected)}%)`,
    ],
    datasets: [
      {
        data: chartValues,
        backgroundColor: [
          '#DCBB57',
          '#7C7F83',
          '#00AEEF',
          '#45B46D',
          '#A0AEC0',
          '#EF4343',
        ],
        borderWidth: 0,
        cutout: '70%',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: 'Device Status Distribution',
        align: 'start' as const,
        font: {
          size: 16,
        },
        padding: {
          top: 5,
          bottom: 30,
        },
        color: '#1A202C',
      },

      legend: {
        position: 'right' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 12,
          boxHeight: 6,
          padding: 12,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'doughnut'>) => `${ctx.label}: ${ctx.raw}`,
        },
      },
    },
  };

  return (
    <div style={{ height: 300 }}>
      <Doughnut
        data={data}
        options={options}
        aria-label="Device status distribution doughnut chart"
      />
    </div>
  );
};
