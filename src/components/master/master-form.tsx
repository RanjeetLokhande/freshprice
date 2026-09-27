'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { FormProvider, useForm, type Resolver } from 'react-hook-form';
import { ApiClientError, applyFieldErrors } from '@/client/api-client';
import { useDeleteMaster, useSaveMaster } from '@/client/queries/masters';
import type { BootstrapData } from '@/shared/bootstrap';
import {
  buildMasterSchema,
  customFieldToMasterField,
  formCustomFields,
  masterFormDefaults,
} from '@/shared/master-schema';
import type { MasterDefinition, MasterRow } from '@/shared/masters';
import { Alert, Button } from '../ui';
import { Sheet } from '../sheet';
import { useToast } from '../toast';
import { DynamicField } from './dynamic-field';
import { lookupOptions } from './lookups';

type Values = Record<string, unknown>;

export function MasterFormSheet({
  def,
  row,
  bootstrap,
  canWrite,
  onClose,
}: {
  def: MasterDefinition;
  /** null = create */
  row: MasterRow | null;
  bootstrap: BootstrapData;
  canWrite: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const save = useSaveMaster(def.entity);
  const remove = useDeleteMaster(def.entity);
  const [formError, setFormError] = useState<string | null>(null);

  const customDefs = useMemo(() => formCustomFields(def, bootstrap.fieldDefinitions), [def, bootstrap.fieldDefinitions]);
  const schema = useMemo(
    () => buildMasterSchema(def, bootstrap.fieldDefinitions, row ? 'update' : 'create'),
    [def, bootstrap.fieldDefinitions, row],
  );

  const form = useForm<Values>({
    resolver: zodResolver(schema as never) as unknown as Resolver<Values>,
    defaultValues: masterFormDefaults(def, bootstrap.fieldDefinitions, row),
    mode: 'onTouched',
  });

  const title = row ? `Edit ${def.singular.toLowerCase()}` : `New ${def.singular.toLowerCase()}`;
  const formId = `master-form-${def.entity}`;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync({ id: row?.id, values });
      toast.show(row ? `${def.singular} saved` : `${def.singular} created`);
      onClose();
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'CONFLICT') {
        setFormError(e.message);
        return;
      }
      const leftovers = applyFieldErrors(e, form.setError as never, (path) => path !== '_' && path !== 'version');
      if (leftovers.length) setFormError(leftovers.join(' '));
    }
  });

  async function onDelete() {
    if (!row) return;
    const name = String(row[def.titleField] ?? def.singular);
    const note = def.softDelete ? ' It will be hidden but kept in history.' : '';
    if (!window.confirm(`Delete "${name}"?${note}`)) return;
    try {
      await remove.mutateAsync(row.id);
      toast.show(`${def.singular} deleted`);
      onClose();
    } catch (e) {
      setFormError(e instanceof ApiClientError ? e.message : 'Could not delete.');
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={canWrite ? title : def.singular}
      footer={
        canWrite ? (
          <div className="flex items-center gap-3">
            {row && (
              <Button type="button" variant="ghost" className="text-danger" onClick={onDelete} loading={remove.isPending}>
                Delete
              </Button>
            )}
            <Button type="button" variant="secondary" className="ml-auto" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={save.isPending}>
              Save
            </Button>
          </div>
        ) : undefined
      }
    >
      <FormProvider {...form}>
        <form id={formId} onSubmit={onSubmit} noValidate>
          <fieldset disabled={!canWrite} className="flex flex-col gap-4">
            {formError && <Alert>{formError}</Alert>}
            {def.fields.map((f) => (
              <DynamicField
                key={f.key}
                field={f}
                name={f.key}
                lookupOptions={f.lookup ? lookupOptions(bootstrap, f.lookup, f.lookupFilter) : undefined}
              />
            ))}

            {customDefs.length > 0 && (
              <>
                <h3 className="mt-2 text-sm font-semibold uppercase tracking-wide text-muted">Additional details</h3>
                {customDefs.map((d) => {
                  const f = customFieldToMasterField(d);
                  return (
                    <DynamicField
                      key={d.key}
                      field={f}
                      name={`attributes.${d.key}`}
                      lookupOptions={f.lookup ? lookupOptions(bootstrap, f.lookup) : undefined}
                    />
                  );
                })}
              </>
            )}
          </fieldset>
        </form>
      </FormProvider>
    </Sheet>
  );
}
