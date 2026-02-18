/**
 * Clack-based WizardPrompter implementation.
 * Provides beautiful CLI prompts using @clack/prompts.
 */

import {
  intro,
  outro,
  note,
  select,
  multiselect,
  text,
  confirm,
  spinner,
  isCancel,
} from "@clack/prompts";
import type {
  WizardPrompter,
  WizardSelectParams,
  WizardMultiSelectParams,
  WizardTextParams,
  WizardConfirmParams,
  WizardProgress,
} from "./prompts";
import { WizardCancelledError } from "./prompts";

export function createClackPrompter(): WizardPrompter {
  return {
    async intro(title: string): Promise<void> {
      intro(title);
    },

    async outro(message: string): Promise<void> {
      outro(message);
    },

    async note(message: string, title?: string): Promise<void> {
      note(message, title);
    },

    async select<T>(params: WizardSelectParams<T>): Promise<T> {
      const result = await select({
        message: params.message,
        options: params.options as unknown as { value: T; label: string; hint?: string }[],
        initialValue: params.initialValue,
      });

      if (isCancel(result)) {
        throw new WizardCancelledError();
      }

      return result as T;
    },

    async multiselect<T>(params: WizardMultiSelectParams<T>): Promise<T[]> {
      const result = await multiselect({
        message: params.message,
        options: params.options as unknown as { value: T; label: string; hint?: string }[],
        initialValues: params.initialValues,
        required: false,
      });

      if (isCancel(result)) {
        throw new WizardCancelledError();
      }

      return result as T[];
    },

    async text(params: WizardTextParams): Promise<string> {
      const result = await text({
        message: params.message,
        defaultValue: params.initialValue,
        placeholder: params.placeholder,
        validate: params.validate,
      });

      if (isCancel(result)) {
        throw new WizardCancelledError();
      }

      return result;
    },

    async confirm(params: WizardConfirmParams): Promise<boolean> {
      const result = await confirm({
        message: params.message,
        initialValue: params.initialValue,
      });

      if (isCancel(result)) {
        throw new WizardCancelledError();
      }

      return result;
    },

    progress(label: string): WizardProgress {
      const s = spinner();
      s.start(label);

      return {
        update: (message: string) => {
          s.message(message);
        },
        stop: (message?: string) => {
          s.stop(message ?? label);
        },
      };
    },
  };
}
