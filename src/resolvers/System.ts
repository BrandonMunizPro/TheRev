import {
  Resolver,
  Query,
  Mutation,
  Field,
  ObjectType,
  Arg,
} from 'type-graphql';
import { ollamaService } from '../ai/OllamaServiceManager';

@ObjectType()
export class OllamaHealthStatus {
  @Field()
  isRunning!: boolean;

  @Field({ nullable: true })
  version!: string | null;

  @Field(() => [String])
  availableModels!: string[];

  @Field()
  gpuStatus!: string;

  @Field({ nullable: true })
  gpuInfo!: string | null;

  @Field({ nullable: true })
  error!: string | null;
}

@ObjectType()
export class OllamaIssue {
  @Field()
  type!: string;

  @Field()
  severity!: string;

  @Field()
  message!: string;

  @Field({ nullable: true })
  details!: string | null;

  @Field({ nullable: true })
  autoFixAction!: string | null;
}

@ObjectType()
export class OllamaDiagnosticResult {
  @Field()
  healthy!: boolean;

  @Field(() => [OllamaIssue])
  issues!: OllamaIssue[];

  @Field(() => [Boolean])
  canAutoFix!: boolean[];

  @Field(() => [String])
  recommendations!: string[];
}

@ObjectType()
export class OllamaAutoFixResult {
  @Field()
  success!: boolean;

  @Field(() => [String])
  actions!: string[];

  @Field(() => [String])
  errors!: string[];
}

@Resolver()
export class SystemResolver {
  @Query(() => OllamaHealthStatus)
  async ollamaHealth(): Promise<OllamaHealthStatus> {
    const health = await ollamaService.checkHealth();
    return {
      isRunning: health.isRunning,
      version: health.version,
      availableModels: health.availableModels,
      gpuStatus: health.gpuStatus,
      gpuInfo: health.gpuInfo,
      error: health.error,
    };
  }

  @Query(() => OllamaDiagnosticResult)
  async ollamaDiagnose(): Promise<OllamaDiagnosticResult> {
    return await ollamaService.diagnose();
  }

  @Mutation(() => OllamaAutoFixResult)
  async ollamaAutoFix(): Promise<OllamaAutoFixResult> {
    return await ollamaService.autoFix();
  }

  @Mutation(() => Boolean)
  async ollamaRestartCPU(): Promise<boolean> {
    return await ollamaService.restartWithCPUMode();
  }

  @Mutation(() => Boolean)
  async ollamaPullModel(
    @Arg('modelName', { nullable: true }) modelName?: string
  ): Promise<boolean> {
    const model = modelName || 'phi3:latest';
    return await ollamaService.pullModel(model);
  }

  @Query(() => String)
  async ollamaInstallInstructions(): Promise<string> {
    return await ollamaService.getInstallInstructions();
  }

  @Query(() => Boolean)
  async isOllamaInstalled(): Promise<boolean> {
    return await ollamaService.isOllamaInstalled();
  }
}
