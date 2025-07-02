
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ModelDefinition, Drone, SimulationState, LogEntry, LogType, DroneStatus, Vector, ModelProvider } from './types';
import { SUPPORTED_MODELS, ART_OF_WAR_PRINCIPLES } from './constants';
import { getDroneAction, IndividualStratagem } from './services/geminiService';
import { PlayIcon, PauseIcon, ResetIcon } from './components/icons';

const SIMULATION_WIDTH = 800;
const SIMULATION_HEIGHT = 600;
const DRONE_COUNT_PER_SWARM = 5;
const DRONE_SPEED = 1;
const DRONE_HEALTH = 100;
const ATTACK_RANGE = 75; // Increased range for more engagement
const ATTACK_DAMAGE = 5;  // Reduced damage for slightly longer battles

// API_KEY existence check for Google AI models
const API_KEY_EXISTS = !!(typeof process !== 'undefined' && process.env && process.env.API_KEY);


// --- Helper Functions ---
const createInitialSwarm = (swarmId: 'blue' | 'red'): Drone[] => {
    return Array.from({ length: DRONE_COUNT_PER_SWARM }, (_, i) => {
        const isBlue = swarmId === 'blue';
        const y_base = isBlue ? SIMULATION_HEIGHT - 100 : 100;
        const x_base = SIMULATION_WIDTH / 2 - (DRONE_COUNT_PER_SWARM / 2 * 60) + (i * 60);
        const pos = { x: x_base, y: y_base };
        return { 
            id: `${swarmId[0]}-drone-${i}`, 
            swarmId,
            position: pos, 
            status: DroneStatus.Idle, 
            targetPosition: pos,
            health: DRONE_HEALTH,
            targetId: null,
        };
    });
};

const getLogIcon = (type: LogType) => {
    switch (type) {
        case LogType.Council: return '🤔';
        case LogType.Stratagem: return '📜';
        case LogType.Success: return '✅';
        case LogType.Error: return '❌';
        case LogType.Attack: return '💥';
        case LogType.Info:
        default: return 'ℹ️';
    }
};

const getStatusColor = (status: DroneStatus) => {
    switch (status) {
        case DroneStatus.Idle: return 'bg-gray-400';
        case DroneStatus.Moving: return 'bg-blue-400';
        case DroneStatus.Assessing: return 'bg-yellow-500';
        case DroneStatus.Executing: return 'bg-green-500';
        case DroneStatus.Attacking: return 'bg-orange-500';
        case DroneStatus.Disabled: return 'bg-red-800';
        default: return 'bg-red-600';
    }
}

// --- Sub-Components ---

interface LogPanelProps {
    logs: LogEntry[];
    currentPrinciple: string;
}

const LogPanel: React.FC<LogPanelProps> = ({ logs, currentPrinciple }) => {
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div className="bg-[#1a1a1a] p-4 rounded-lg shadow-lg flex flex-col h-full">
            <h2 className="text-xl font-bold text-gray-200 border-b border-gray-600 pb-2 mb-2">兵 法 (War Journal)</h2>
            <div className="bg-gray-800 p-2 rounded-md mb-3 text-center">
                <p className="text-xs text-gray-400">Guiding Principle:</p>
                <p className="text-sm font-semibold text-yellow-400">{currentPrinciple}</p>
            </div>
            <div ref={logContainerRef} className="flex-grow overflow-y-auto pr-2 space-y-2">
                {logs.map(log => (
                    <div key={log.id} className={`text-sm p-2 rounded-md ${log.type === LogType.Stratagem ? 'bg-purple-900/50' : 'bg-gray-800/50'}`}>
                        <div className="flex items-start">
                            <span className="mr-2">{getLogIcon(log.type)}</span>
                            <div>
                                <p className={`text-xs ${log.author?.startsWith('b-') ? 'text-blue-400' : log.author?.startsWith('r-') ? 'text-red-400' : 'text-gray-400'}`}>
                                    {log.timestamp} {log.author && ` - ${log.author}`}
                                </p>
                                <p className="text-gray-200 whitespace-pre-wrap">{log.message}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface SimulationCanvasProps {
    drones: Drone[];
}

const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ drones }) => (
    <div className="relative bg-black bg-opacity-50 rounded-lg shadow-inner border-2 border-gray-700" style={{ width: SIMULATION_WIDTH, height: SIMULATION_HEIGHT }}>
        {drones.map(drone => (
            <div
                key={drone.id}
                className="absolute"
                style={{ left: drone.position.x, top: drone.position.y, transition: 'all 0.1s linear' }}
            >
                <div 
                    className={`w-4 h-4 rounded-full flex items-center justify-center border-2 shadow-md 
                    ${drone.swarmId === 'blue' ? 'border-blue-300' : 'border-red-300'} 
                    ${getStatusColor(drone.status)}`}
                    style={{transform: 'translate(-50%, -50%)'}}
                    title={`ID: ${drone.id} | HP: ${drone.health} | Status: ${drone.status}`}
                >
                    <div className="text-white text-[8px] font-mono">{drone.id.split('-')[2]}</div>
                </div>
                {/* Health bar */}
                <div className="w-6 h-1 bg-gray-600 rounded-full" style={{transform: 'translate(-50%, 10px)'}}>
                    <div className="h-full bg-green-500 rounded-full" style={{width: `${drone.health}%`}}></div>
                </div>
            </div>
        ))}
    </div>
);


export default function App(): React.ReactElement {
    const [blueDrones, setBlueDrones] = useState<Drone[]>(createInitialSwarm('blue'));
    const [redDrones, setRedDrones] = useState<Drone[]>(createInitialSwarm('red'));
    const [simulationState, setSimulationState] = useState<SimulationState>(SimulationState.Stopped);
    
    const defaultModel = SUPPORTED_MODELS.find(m => m.provider === ModelProvider.Ollama) || SUPPORTED_MODELS[0];
    const [blueModel, setBlueModel] = useState<ModelDefinition>(defaultModel);
    const [redModel, setRedModel] = useState<ModelDefinition>(defaultModel);

    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [currentPrinciple, setCurrentPrinciple] = useState<string>(ART_OF_WAR_PRINCIPLES[0]);
    
    // Refs to hold the latest state for use in callbacks without causing re-renders
    const blueDronesRef = useRef(blueDrones);
    blueDronesRef.current = blueDrones;
    const redDronesRef = useRef(redDrones);
    redDronesRef.current = redDrones;
    const logsRef = useRef(logs);
    logsRef.current = logs;
    const currentPrincipleRef = useRef(currentPrinciple);
    currentPrincipleRef.current = currentPrinciple;

    const blueModelRef = useRef(blueModel);
    blueModelRef.current = blueModel;
    const redModelRef = useRef(redModel);
    redModelRef.current = redModel;

    const simulationStateRef = useRef(simulationState);
    simulationStateRef.current = simulationState;

    const droneThinkTimers = useRef<Map<string, number>>(new Map());
    const thinkingDrones = useRef(new Set<string>()); // Re-entrancy guard

    const addLog = useCallback((message: string, type: LogType, author?: string) => {
        setLogs(prev => [...prev.slice(-100), {
            id: `log-${Date.now()}-${Math.random()}`,
            timestamp: new Date().toLocaleTimeString(),
            message,
            type,
            author,
        }]);
    }, []);

    // This function now ONLY updates the React state. The logic is in the main loop.
    const updateDroneIntent = useCallback((droneId: string, updates: Partial<Drone>) => {
        const updater = (drones: Drone[]) => drones.map(d => d.id === droneId ? { ...d, ...updates } : d);
        if (droneId.startsWith('b-')) {
            setBlueDrones(updater);
        } else {
            setRedDrones(updater);
        }
    }, []);
    
    const runDroneLogic = useCallback(async (drone: Drone) => {
        if (simulationStateRef.current !== SimulationState.Running || drone.status === DroneStatus.Disabled || thinkingDrones.current.has(drone.id)) {
            return;
        }

        try {
            thinkingDrones.current.add(drone.id);
            updateDroneIntent(drone.id, { status: DroneStatus.Assessing });

            const friendlySwarm = drone.swarmId === 'blue' ? blueDronesRef.current : redDronesRef.current;
            const enemySwarm = drone.swarmId === 'blue' ? redDronesRef.current : blueDronesRef.current;
            const model = drone.swarmId === 'blue' ? blueModelRef.current : redModelRef.current;
            const activeEnemies = enemySwarm.filter(d => d.status !== DroneStatus.Disabled);

            const stratagem = await getDroneAction(
                drone, 
                friendlySwarm, 
                activeEnemies, 
                currentPrincipleRef.current, 
                model, 
                logsRef.current,
                addLog // Pass the logger for progress updates
            );
            
            // Post-await checks for simulation and drone status are critical.
            if (simulationStateRef.current !== SimulationState.Running) return;

            const currentDroneState = (drone.swarmId === 'blue' ? blueDronesRef.current : redDronesRef.current).find(d => d.id === drone.id);
            if (!currentDroneState || currentDroneState.status === DroneStatus.Disabled) {
                return;
            }

            if (stratagem) {
                addLog(`"${stratagem.stratagem_name}": ${stratagem.justification}`, LogType.Stratagem, drone.id);
                switch(stratagem.action.type) {
                    case 'MOVE':
                        updateDroneIntent(drone.id, { status: DroneStatus.Moving, targetPosition: stratagem.action.position || drone.position, targetId: null });
                        break;
                    case 'ATTACK':
                        const targetId = stratagem.action.target_id;
                        const currentEnemySwarm = drone.swarmId === 'blue' ? redDronesRef.current : blueDronesRef.current;
                        const activeEnemiesNow = currentEnemySwarm.filter(d => d.status !== DroneStatus.Disabled);
                        if (targetId && activeEnemiesNow.some(e => e.id === targetId)) {
                             updateDroneIntent(drone.id, { status: DroneStatus.Attacking, targetId: targetId });
                        } else {
                             addLog(`Invalid or defeated target: ${targetId}. Holding position.`, LogType.Error, drone.id);
                             updateDroneIntent(drone.id, { status: DroneStatus.Idle });
                        }
                        break;
                    case 'HOLD':
                         updateDroneIntent(drone.id, { status: DroneStatus.Idle, targetId: null });
                        break;
                }
            } else {
                 addLog(`Failed to produce a valid stratagem. Holding position.`, LogType.Error, drone.id);
                 updateDroneIntent(drone.id, { status: DroneStatus.Idle });
            }
        } catch (error) {
            if (simulationStateRef.current !== SimulationState.Running) return;

            const currentDroneState = (drone.swarmId === 'blue' ? blueDronesRef.current : redDronesRef.current).find(d => d.id === drone.id);
            if (currentDroneState && currentDroneState.status !== DroneStatus.Disabled) {
                addLog(`An error occurred during decision making: ${(error as Error).message}`, LogType.Error, drone.id);
                updateDroneIntent(drone.id, { status: DroneStatus.Idle });
            }
        } finally {
            thinkingDrones.current.delete(drone.id);
        }
    }, [addLog, updateDroneIntent]);


    const resetSimulation = useCallback(() => {
        setSimulationState(SimulationState.Stopped);
        setBlueDrones(createInitialSwarm('blue'));
        setRedDrones(createInitialSwarm('red'));
        setLogs([]);
        setCurrentPrinciple(ART_OF_WAR_PRINCIPLES[0]);
        droneThinkTimers.current.forEach(timerId => window.clearTimeout(timerId));
        droneThinkTimers.current.clear();
        thinkingDrones.current.clear();
        addLog("Simulation reset. Awaiting new orders.", LogType.Info, "System");
    }, [addLog]);

    const handleModelChange = useCallback((modelId: string, swarmId: 'blue' | 'red') => {
        const model = SUPPORTED_MODELS.find(m => m.id === modelId);
        if (model) {
            const swarmName = swarmId === 'blue' ? 'Blue Swarm' : 'Red Swarm';
            if (swarmId === 'blue') {
                setBlueModel(model);
            } else {
                setRedModel(model);
            }
            addLog(`AI Model for ${swarmName} switched to ${model.name}.`, LogType.Info, "System");
        }
    }, [addLog]);
    
    // Main Simulation Loop
    useEffect(() => {
        if (simulationState !== SimulationState.Running) {
            return;
        }

        // --- ACTION LOOP ---
        const simulationInterval = window.setInterval(() => {
            const nextDronesState = new Map<string, Drone>();
            [...blueDronesRef.current, ...redDronesRef.current].forEach(d => {
                nextDronesState.set(d.id, { ...d, position: { ...d.position } });
            });

            for (const drone of nextDronesState.values()) {
                if (drone.status === DroneStatus.Disabled) continue;

                if (drone.status === DroneStatus.Attacking && drone.targetId) {
                    const target = nextDronesState.get(drone.targetId);
                    
                    if (target && target.status !== DroneStatus.Disabled) {
                        const dx = target.position.x - drone.position.x;
                        const dy = target.position.y - drone.position.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);

                        if (distance > ATTACK_RANGE) { 
                            drone.position.x += (dx / distance) * DRONE_SPEED;
                            drone.position.y += (dy / distance) * DRONE_SPEED;
                        } else {
                            target.health = Math.max(0, target.health - ATTACK_DAMAGE);
                            if (Math.random() < 0.1) { // Log attacks occasionally to avoid spam
                                addLog(`${drone.id} attacks ${target.id}!`, LogType.Attack, "Combat");
                            }
                            
                            if (target.health === 0) {
                                addLog(`${target.id} has been disabled!`, LogType.Success, "Combat");
                                target.status = DroneStatus.Disabled;
                                drone.status = DroneStatus.Idle;
                                drone.targetId = null;
                            }
                        }
                    } else {
                        drone.status = DroneStatus.Idle;
                        drone.targetId = null;
                    }
                }
                else if (drone.status === DroneStatus.Moving) {
                    const dx = drone.targetPosition.x - drone.position.x;
                    const dy = drone.targetPosition.y - drone.position.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < DRONE_SPEED) {
                        drone.position = drone.targetPosition;
                        drone.status = DroneStatus.Idle;
                    } else {
                        drone.position.x += (dx / distance) * DRONE_SPEED;
                        drone.position.y += (dy / distance) * DRONE_SPEED;
                    }
                }
            }

            const newBlue: Drone[] = [];
            const newRed: Drone[] = [];
            for (const d of nextDronesState.values()) {
                (d.swarmId === 'blue' ? newBlue : newRed).push(d);
            }
            setBlueDrones(newBlue);
            setRedDrones(newRed);

            const aliveBlue = newBlue.some(d => d.status !== DroneStatus.Disabled);
            const aliveRed = newRed.some(d => d.status !== DroneStatus.Disabled);
            if (!aliveBlue || !aliveRed) {
                setSimulationState(SimulationState.Stopped);
                const winner = aliveBlue ? "Blue Swarm" : "Red Swarm";
                addLog(`Victory for ${winner}! The battle is over.`, LogType.Success, "System");
            }
        }, 100);

        // --- THINKING LOOP ---
        const thinkingLoop = (drone: Drone) => {
            if (simulationStateRef.current !== SimulationState.Running || drone.status === DroneStatus.Disabled) {
                return;
            }

            const timerId = window.setTimeout(() => {
                runDroneLogic(drone).finally(() => {
                    thinkingLoop(drone);
                });
            }, 5000 + Math.random() * 5000);
            
            droneThinkTimers.current.set(drone.id, timerId);
        };
        [...blueDronesRef.current, ...redDronesRef.current].forEach(thinkingLoop);

        // --- PRINCIPLE CHANGE LOOP ---
        const principleInterval = window.setInterval(() => {
            setCurrentPrinciple(p => {
                const currentIndex = ART_OF_WAR_PRINCIPLES.indexOf(p);
                const nextIndex = (currentIndex + 1) % ART_OF_WAR_PRINCIPLES.length;
                const newPrinciple = ART_OF_WAR_PRINCIPLES[nextIndex];
                addLog(`Guiding principle updated to: "${newPrinciple}"`, LogType.Info, "System");
                return newPrinciple;
            });
        }, 25000);

        return () => {
            window.clearInterval(simulationInterval);
            window.clearInterval(principleInterval);
            droneThinkTimers.current.forEach(timerId => window.clearTimeout(timerId));
            droneThinkTimers.current.clear();
        };
    }, [simulationState, addLog, runDroneLogic]);

    const isBlueGoogle = blueModel.provider === ModelProvider.GoogleAI;
    const isRedGoogle = redModel.provider === ModelProvider.GoogleAI;
    const isStartDisabled = simulationState === SimulationState.Stopped &&
        !API_KEY_EXISTS &&
        (isBlueGoogle || isRedGoogle);
    const disabledMessage = `API_KEY not found. ${isBlueGoogle && isRedGoogle ? 'Blue and Red swarms require it.' : isBlueGoogle ? 'Blue Swarm requires it.' : 'Red Swarm requires it.'} Select Ollama models to run without an API key.`;


    return (
        <div className="min-h-screen bg-[#f5f5dc] text-gray-800 p-4 flex flex-col items-center font-sans">
            <header className="text-center mb-4">
                <h1 className="text-5xl font-bold" style={{ fontFamily: 'serif' }}>孙子兵法</h1>
                <p className="text-xl text-gray-600">Decentralized Sun Tzu Swarm</p>
            </header>
            <div className="flex flex-col lg:flex-row gap-4 w-full max-w-7xl">
                <div className="flex-shrink-0">
                    <SimulationCanvas drones={[...blueDrones, ...redDrones]} />
                </div>
                <div className="flex-grow flex flex-col gap-4">
                    <div className="bg-[#1a1a1a] p-4 rounded-lg shadow-lg flex flex-col space-y-4">
                        <h2 className="text-xl font-bold text-gray-200 border-b border-gray-600 pb-2 text-center">軍 形 (Controls)</h2>

                        <div className="flex items-center justify-center space-x-4">
                            <button
                                onClick={() => setSimulationState(simulationState === SimulationState.Running ? SimulationState.Paused : SimulationState.Running)}
                                className={`w-24 px-4 py-2 rounded-md font-semibold text-white transition-all duration-200 ${simulationState === SimulationState.Running ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'} disabled:bg-gray-500 disabled:cursor-not-allowed`}
                                disabled={isStartDisabled}
                                aria-label={simulationState === SimulationState.Running ? 'Pause Simulation' : 'Start Simulation'}
                            >
                                {simulationState === SimulationState.Running ? <PauseIcon className="w-6 h-6 mx-auto" /> : <PlayIcon className="w-6 h-6 mx-auto" />}
                            </button>
                            <button onClick={resetSimulation} className="w-24 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-md font-semibold text-white transition-all duration-200" aria-label="Reset Simulation">
                                <ResetIcon className="w-6 h-6 mx-auto" />
                            </button>
                        </div>
                        
                        {isStartDisabled && <div className="text-red-400 text-xs text-center p-2 bg-red-900/50 rounded">{disabledMessage}</div>}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                            {/* Blue Swarm */}
                            <div>
                                 <label htmlFor="blue-model-select" className="block text-lg font-semibold text-blue-400 mb-2">我方 (Blue Swarm)</label>
                                 <select
                                    id="blue-model-select"
                                    value={blueModel.id}
                                    onChange={(e) => handleModelChange(e.target.value, 'blue')}
                                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-md p-2 focus:ring-2 focus:ring-blue-500"
                                 >
                                    {SUPPORTED_MODELS.map(model => (
                                        <option key={model.id} value={model.id}>{model.name}</option>
                                    ))}
                                 </select>
                            </div>
                            {/* Red Swarm */}
                            <div>
                                 <label htmlFor="red-model-select" className="block text-lg font-semibold text-red-400 mb-2">敵方 (Red Swarm)</label>
                                 <select
                                    id="red-model-select"
                                    value={redModel.id}
                                    onChange={(e) => handleModelChange(e.target.value, 'red')}
                                    className="w-full bg-gray-700 border border-gray-600 text-white rounded-md p-2 focus:ring-2 focus:ring-red-500"
                                 >
                                    {SUPPORTED_MODELS.map(model => (
                                        <option key={model.id} value={model.id}>{model.name}</option>
                                    ))}
                                 </select>
                            </div>
                        </div>
                    </div>
                    <div className="flex-grow min-h-[300px]">
                       <LogPanel logs={logs} currentPrinciple={currentPrinciple} />
                    </div>
                </div>
            </div>
        </div>
    );
};