import type { AirportConfig } from '../simulation/airportConfig';
import type { AirportState } from '../simulation/types';

export interface RadarInsetRenderOptions {
  canvas: HTMLCanvasElement;
  rangeLabel: HTMLElement;
  config: AirportConfig;
  state: AirportState;
  focusedFlightId: number | null;
}

/** Draws the compact radar from authoritative simulation poses only. */
export function drawRadarInset(options: RadarInsetRenderOptions): void {
  const { canvas, rangeLabel, config, state, focusedFlightId } = options;
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const range = config.scope === 'center' ? 360 : 215;
  const scale = Math.min(width, height) * 0.44 / range;
  context.clearRect(0, 0, width, height);
  context.fillStyle = state.nightMode ? '#031210' : '#061b19';
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(121, 200, 176, 0.18)';
  context.lineWidth = 1.5;
  for (const amount of [0.25, 0.5, 0.75, 1]) {
    context.beginPath();
    context.arc(centerX, centerY, range * scale * amount, 0, Math.PI * 2);
    context.stroke();
  }
  context.beginPath();
  context.moveTo(centerX, centerY - range * scale);
  context.lineTo(centerX, centerY + range * scale);
  context.moveTo(centerX - range * scale, centerY);
  context.lineTo(centerX + range * scale, centerY);
  context.stroke();

  context.save();
  context.translate(centerX, centerY);
  for (const runway of config.runways) {
    const directionX = Math.cos(runway.heading);
    const directionY = Math.sin(runway.heading);
    const half = runway.length / 2;
    context.beginPath();
    context.moveTo((runway.center[0] - directionX * half) * scale, -(runway.center[1] - directionY * half) * scale);
    context.lineTo((runway.center[0] + directionX * half) * scale, -(runway.center[1] + directionY * half) * scale);
    const closed = state.surfaceDisruptions.some((disruption) => (
      disruption.runwayId === runway.id
      && (disruption.kind === 'runway-closure' || disruption.kind === 'disabled-aircraft')
    ));
    context.strokeStyle = closed ? 'rgba(239, 147, 127, 0.55)' : 'rgba(244, 232, 206, 0.68)';
    context.lineWidth = Math.max(2, runway.width * scale * 0.28);
    context.stroke();
  }
  context.restore();

  context.font = '800 15px "Segoe UI", sans-serif';
  context.textBaseline = 'middle';
  const labelRows: number[] = [];
  for (const flight of state.flights) {
    const x = centerX + flight.motion.x * scale;
    const y = centerY - flight.motion.y * scale;
    if (x < 5 || y < 5 || x > width - 5 || y > height - 5) continue;
    const arrival = flight.phase === 'approach' || flight.phase === 'landing';
    const departure = flight.phase === 'takeoff';
    const color = arrival ? '#80ddc7' : departure ? '#efc775' : 'rgba(188, 232, 216, 0.58)';
    const headingX = Math.cos(flight.motion.heading);
    const headingY = -Math.sin(flight.motion.heading);
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + headingX * 16, y + headingY * 16);
    context.stroke();
    context.beginPath();
    if (departure) {
      context.moveTo(x, y - 5);
      context.lineTo(x + 5, y);
      context.lineTo(x, y + 5);
      context.lineTo(x - 5, y);
      context.closePath();
    } else {
      context.arc(x, y, arrival ? 4.5 : 3.2, 0, Math.PI * 2);
    }
    context.fill();
    if (flight.id === focusedFlightId) {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, 10, 0, Math.PI * 2);
      context.stroke();
    }
    if (arrival || departure || flight.id === focusedFlightId) {
      let labelY = y - 8;
      while (labelRows.some((row) => Math.abs(row - labelY) < 17)) labelY += 17;
      labelY = Math.max(10, Math.min(height - 10, labelY));
      labelRows.push(labelY);
      context.fillStyle = color;
      context.fillText(flight.callsign.replace(/\s+/g, ''), x + 10, labelY);
    }
  }
  const metersPerUnit = config.vectorData?.runtimeReference.worldMetersPerUnit ?? 38;
  rangeLabel.textContent = `${Math.max(1, Math.round(range * metersPerUnit / 1_852))} NM`;
}
