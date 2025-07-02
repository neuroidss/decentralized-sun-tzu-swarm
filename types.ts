export enum ModelProvider {
    GoogleAI = 'GoogleAI',
    Ollama = 'Ollama',
}

export interface ModelDefinition {
    id: string;
    name: string;
    provider: ModelProvider;
}

export enum DroneStatus {
    Idle = 'Idle',
    Moving = 'Moving',
    Assessing = 'Assessing', // Re-purposed for individual thinking
    Executing = 'Executing',
    Attacking = 'Attacking',
    Disabled = 'Disabled',
}

export interface Vector {
    x: number;
    y: number;
}

export interface Drone {
    id: string;
    swarmId: 'blue' | 'red';
    position: Vector;
    status: DroneStatus;
    targetPosition: Vector;
    health: number;
    targetId: string | null; // To target a specific enemy drone
}

export enum SimulationState {
    Stopped = 'Stopped',
    Running = 'Running',
    Paused = 'Paused',
}

export enum LogType {
    Info = 'Info',
    Council = 'Council', // Will now represent individual decision-making
    Stratagem = 'Stratagem',
    Error = 'Error',
    Success = 'Success',
    Attack = 'Attack',
}

export interface LogEntry {
    id: string;
    timestamp: string;
    type: LogType;
    message: string;
    author?: string;
}
