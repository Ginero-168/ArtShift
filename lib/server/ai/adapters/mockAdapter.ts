import type {
  AiProviderId,
  AiProviderStatus,
  AiTaskKind,
  AiTaskOutput,
} from "@/lib/ai-runtime/contracts";
import type {
  AiProviderAdapter,
  AiProviderRequest,
  AiProviderResult,
} from "@/lib/ai-runtime/runtime";

export class MockAiProviderAdapter implements AiProviderAdapter {
  readonly id: AiProviderId = "mock";
  readonly requests: AiProviderRequest[] = [];

  constructor(
    private readonly handler: (
      request: AiProviderRequest,
    ) => Promise<AiProviderResult<unknown>> | AiProviderResult<unknown>,
    private readonly tasks: AiTaskKind[] = ["vision.describe"],
  ) {}

  async status(): Promise<AiProviderStatus> {
    return {
      id: this.id,
      label: "Mock provider",
      configured: true,
      state: "ready",
      tasks: this.tasks,
      models: [{ id: "mock-model", profile: "economy" }],
    };
  }

  async execute<K extends AiTaskKind>(
    request: AiProviderRequest<K>,
  ): Promise<AiProviderResult<AiTaskOutput<K>>> {
    this.requests.push(request);
    return (await this.handler(request)) as AiProviderResult<AiTaskOutput<K>>;
  }
}
