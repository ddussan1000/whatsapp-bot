import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  useCreateProductMutation,
  useProductsQuery,
  useUpdateProductMutation,
} from "@/lib/hooks";
import { getActiveProductId, setActiveProductId } from "@/lib/active-product";

export function ProductsPage() {
  const products = useProductsQuery();
  const createProduct = useCreateProductMutation();
  const updateProduct = useUpdateProductMutation();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [dispatchKeywords, setDispatchKeywords] = useState("");
  const [activeProductId, setActiveProductState] =
    useState(getActiveProductId());

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Productos</h2>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo producto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Nombre producto"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            placeholder="slug-producto"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <Textarea
            rows={3}
            placeholder="System prompt del producto"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
          <Input
            placeholder="keywords separadas por coma"
            value={dispatchKeywords}
            onChange={(e) => setDispatchKeywords(e.target.value)}
          />
          <Button
            onClick={() => {
              if (!name.trim() || !slug.trim()) return;
              createProduct.mutate({
                name: name.trim(),
                slug: slug.trim(),
                systemPrompt,
                dispatchKeywords,
              });
              setName("");
              setSlug("");
              setSystemPrompt("");
              setDispatchKeywords("");
            }}
          >
            Crear producto
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(products.data ?? []).map((p) => (
                <TableRow
                  key={p.id}
                  data-state={activeProductId === p.id ? "selected" : undefined}
                >
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.slug}</TableCell>
                  <TableCell>
                    <Badge variant={p.is_active ? "default" : "outline"}>
                      {p.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant={
                          activeProductId === p.id ? "default" : "outline"
                        }
                        onClick={() => {
                          setActiveProductId(p.id);
                          setActiveProductState(p.id);
                        }}
                      >
                        {activeProductId === p.id
                          ? "Activo global"
                          : "Activar global"}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          updateProduct.mutate({
                            id: p.id,
                            payload: { isActive: !p.is_active },
                          })
                        }
                      >
                        {p.is_active ? "Desactivar" : "Activar"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
