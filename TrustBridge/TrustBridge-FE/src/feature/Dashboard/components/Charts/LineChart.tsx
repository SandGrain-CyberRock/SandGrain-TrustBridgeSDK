import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Title,
  Filler,
  type TooltipItem,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Title,
  Filler,
);

export const LineChart = () => {
  const data = {
    labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
    datasets: [
      {
        label: 'Success',
        data: [60, 95, 60, 61, 90, 35],
        borderColor: '#A8DCBB',
        backgroundColor: 'rgba(168, 220, 187, 0.4)',
        tension: 0.4,
        pointRadius: 4,
        fill: '+1',
      },

      {
        label: 'Failure',
        data: [39, 41, 51, 51, 45, 22],
        borderColor: '#F26969',
        backgroundColor: 'rgba(242, 105, 105, 0.2)',
        tension: 0.4,
        pointRadius: 4,
        fill: 'origin',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: {
        display: true,
        text: 'Authentication trends(24h)',
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
        display: true,
        position: 'bottom' as const,
        labels: {
          usePointStyle: true,
          pointStyle: 'circle',
          boxWidth: 12,
          boxHeight: 8,
          padding: 12,
        },
      },
      tooltip: {
        enabled: true,
      },
    },
    tooltip: {
      callbacks: {
        label: (ctx: TooltipItem<'line'>) => `${ctx.label}: ${ctx.raw}`,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        min: 0,
        max: 100,
        ticks: {
          stepSize: 20,
        },
      },
    },
  };

  return (
    <div style={{ height: 300 }}>
      <Line
        data={data}
        options={options}
        aria-label="Authentication trends line chart across 24H"
      />
    </div>
  );
};
