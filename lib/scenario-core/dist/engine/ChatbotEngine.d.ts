import { ScenarioData, ScenarioNode } from '../types/index';
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
    getVersion(): string;
    getCompletionMessage(): string;
}
