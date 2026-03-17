import { ScenarioData, ScenarioNode } from '../types/index';
export interface EngineCallbacks {
    onMessage?: (node: ScenarioNode, updatedSlots: Record<string, any>) => void;
    onDelay?: (node: ScenarioNode) => Promise<void>;
    onApi?: (node: ScenarioNode, slots: Record<string, any>) => Promise<{
        success: boolean;
        newSlots: Record<string, any>;
    }>;
    onLlm?: (node: ScenarioNode, slots: Record<string, any>) => Promise<{
        success: boolean;
        newSlots: Record<string, any>;
    }>;
    onToast?: (node: ScenarioNode, slots: Record<string, any>) => void;
    onLink?: (node: ScenarioNode, slots: Record<string, any>) => void;
    onEnd?: (slots: Record<string, any>) => void;
    onError?: (error: any) => void;
}
export declare class ChatbotEngine {
    private scenario;
    constructor(scenario: ScenarioData);
    getNodeById(nodeId: string): ScenarioNode | undefined;
    interpolateMessage(message: string, slots: Record<string, any>): string;
    getDeepValue(obj: any, path: string): any;
    evaluateCondition(slotValue: any, operator: string, conditionValue: any): boolean;
    getNextNode(currentNodeId: string, sourceHandle?: string | null, slots?: any): ScenarioNode | null;
    isInteractiveNode(node: ScenarioNode | undefined): boolean;
    isAutoPassthroughNode(node: ScenarioNode | undefined): boolean;
    applySetSlot(node: ScenarioNode, slots: Record<string, any>): Record<string, any>;
    run(startNodeId: string | null | undefined, currentSlots: Record<string, any>, callbacks?: EngineCallbacks): Promise<{
        status: 'active' | 'completed' | 'failed';
        currentNodeId: string | null;
        slots: Record<string, any>;
    }>;
}
