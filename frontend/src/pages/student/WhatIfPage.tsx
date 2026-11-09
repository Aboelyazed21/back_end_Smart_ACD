import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeftRight, Info } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import type { Program, WhatIfResult } from '../../lib/types';
import { PROGRAM_LABELS } from '../../lib/constants';
import { formatInt } from '../../lib/format';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { DecisionCard } from '../../components/ui/Decision';
import { Select } from '../../components/ui/Input';
import { PageHeader, StatCard } from '../../components/ui/Page';

const PROGRAM_OPTIONS = (Object.keys(PROGRAM_LABELS) as Program[]).map((program) => ({
  value: program,
  label: `${PROGRAM_LABELS[program].ar} (${program})`,
}));

export function WhatIfPage() {
  const [target, setTarget] = useState<Program>('CS');
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      api<{ data: WhatIfResult }>('/student/whatif/major-switch', {
        method: 'POST',
        body: { targetProgram: target },
      }),
    onSuccess: (data) => setResult(data.data),
  });

  return (
    <div>
      <PageHeader
        eyebrow="محاكاة تغيير التخصص"
        title="ماذا يحدث لو غيّرت تخصصي؟"
        description="فقط المقررات ذات الكود المتطابق تُعدّ مكافئة. كل مقرر آخر يحتاج مراجعة المرشد والكلية — لا يوجد تحويل تلقائي."
      />

      <Card className="mb-4">
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <Select
              label="التخصص المستهدف"
              value={target}
              onChange={(event) => setTarget(event.target.value as Program)}
              options={PROGRAM_OPTIONS}
              className="w-64"
            />
            <Button
              onClick={() => mutation.mutate()}
              loading={mutation.isPending}
              icon={<ArrowLeftRight className="h-4 w-4" />}
            >
              تشغيل المحاكاة
            </Button>
          </div>
          {mutation.isError && (
            <Alert tone="danger" className="mt-3">
              {errorMessage(mutation.error)}
            </Alert>
          )}
        </CardContent>
      </Card>

      {!result ? (
        <EmptyState
          title="لم تُشغّل المحاكاة بعد"
          description="اختر التخصص المستهدف لعرض المقررات المتكافئة والمتبقية."
          icon={<ArrowLeftRight className="h-6 w-6" />}
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="من تخصص" value={`${PROGRAM_LABELS[result.from_program].ar}`} tone="neutral" />
            <StatCard label="إلى تخصص" value={`${PROGRAM_LABELS[result.target_program].ar}`} tone="brand" />
            <StatCard
              label="ساعات متبقية تقديرية"
              value={formatInt(result.estimated_remaining_credits)}
              hint="استشارية فقط"
              tone="gold"
            />
          </div>

          <DecisionCard decision={result.decision} title="قرار محاكاة تغيير التخصص" />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle action={<Badge tone="success">{result.equivalent_codes.length}</Badge>}>
                  مقررات متكافئة
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.equivalent_codes.length === 0 ? (
                  <p className="text-sm text-ink-500">لا توجد مقررات متطابقة الكود.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {result.equivalent_codes.map((code) => (
                      <Badge key={code} tone="success" className="font-mono">
                        {code}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle action={<Badge tone="warning">{result.non_equivalent_codes.length}</Badge>}>
                  تحتاج مراجعة
                </CardTitle>
              </CardHeader>
              <CardContent>
                {result.non_equivalent_codes.length === 0 ? (
                  <p className="text-sm text-ink-500">لا توجد مقررات تحتاج مراجعة.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {result.non_equivalent_codes.map((code) => (
                      <Badge key={code} tone="warning" className="font-mono">
                        {code}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle action={<Badge tone="neutral">{result.remaining_target_codes.length}</Badge>}>
                متطلبات التخصص المستهدف المتبقية
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.remaining_target_codes.length === 0 ? (
                <p className="text-sm text-ink-500">لا توجد متطلبات متبقية.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {result.remaining_target_codes.map((code) => (
                    <Badge key={code} tone="neutral" className="font-mono">
                      {code}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Alert tone="info" icon={<Info className="h-5 w-5" />} title="قرار تغيير التخصص ليس آليًا">
            هذه المحاكاة لا تغيّر تخصصك. القرار النهائي يحتاج طلبًا رسميًا وموافقة المرشد والكلية وفق المادة 5.2.
          </Alert>
        </div>
      )}
    </div>
  );
}
