import { utils, writeFile } from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ReportData {
  colaborador: string;
  cargo: string;
  setor: string;
  pontos: number;
  valor: number;
  faltas: number;
  diasTrabalhados: number;
}

interface ExportParams {
  unitName: string;
  unitLogo?: string;
  competencia: string;
  data: ReportData[];
}

interface SimplifiedReportParams {
  unitName: string;
  unitLogo?: string;
  competencia: string;
  totalArrecadado: number;
  setores: string;
  valorPontoSalao?: number;
  valorPontoCozinha?: number;
  totalSalao?: number;
  totalCozinha?: number;
}

async function getBase64ImageFromUrl(imageUrl: string): Promise<string | null> {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error('Error loading logo for PDF:', e);
    return null;
  }
}

export const exportService = {
  exportToExcel: ({ unitName, competencia, data }: ExportParams) => {
    const wsData = data.map(item => ({
      'Colaborador': item.colaborador,
      'Cargo': item.cargo,
      'Setor/Pool': item.setor,
      'Points': item.pontos,
      'Valor Distribuído (R$)': item.valor,
      'Faltas': item.faltas,
      'Dias Trabalhados': item.diasTrabalhados
    }));

    const wb = utils.book_new();
    const headers = [
      [`Relatório de Distribuição de Gorjetas`],
      [`Unidade: ${unitName}`, `Competência: ${competencia}`],
      []
    ];
    
    const ws = utils.aoa_to_sheet(headers);
    
    // Add data starting at A4
    utils.sheet_add_json(ws, wsData, { origin: 'A4' });
    
    // Column widths
    ws['!cols'] = [
      { wch: 30 }, // Colaborador
      { wch: 20 }, // Cargo
      { wch: 15 }, // Setor
      { wch: 10 }, // Pontos
      { wch: 20 }, // Valor
      { wch: 10 }, // Faltas
      { wch: 15 }  // Dias
    ];

    utils.book_append_sheet(wb, ws, 'Distribuição');
    
    writeFile(wb, `Relatorio_Distribuicao_${competencia.replace(/ /g, '_')}.xlsx`);
  },

  exportToPDF: async ({ unitName, unitLogo, competencia, data }: ExportParams) => {
    const doc = new jsPDF();
    const now = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });

    // Try to add Logo
    if (unitLogo) {
      const base64Logo = await getBase64ImageFromUrl(unitLogo);
      if (base64Logo) {
        try {
          doc.addImage(base64Logo, 'PNG', 14, 10, 30, 15, undefined, 'FAST');
        } catch (e) {
          console.warn('Failed to add image to PDF');
        }
      }
    }

    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório de Distribuição', 14, unitLogo ? 35 : 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    const startY = unitLogo ? 42 : 28;
    doc.text(`Unidade: ${unitName}`, 14, startY);
    doc.text(`Competência: ${competencia}`, 14, startY + 5);
    doc.text(`Gerado em: ${now}`, 14, startY + 10);

    // Table
    const tableHeaders = [
      ['Colaborador', 'Cargo', 'Setor', 'Pontos', 'Valor (R$)']
    ];

    const tableData = data.map(item => [
      item.colaborador,
      item.cargo,
      item.setor,
      item.pontos.toString(),
      item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ]);

    autoTable(doc, {
      head: tableHeaders,
      body: tableData,
      startY: startY + 18,
      theme: 'striped',
      headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: {
        3: { halign: 'center' },
        4: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // Summary
    const totalDistribuido = data.reduce((sum, item) => sum + item.valor, 0);
    const finalY = (doc as any).lastAutoTable.finalY + 12;
    
    doc.setDrawColor(240);
    doc.line(14, finalY - 5, 196, finalY - 5);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text(`VALOR TOTAL DISTRIBUÍDO:`, 14, finalY);
    doc.text(`R$ ${totalDistribuido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 196, finalY, { align: 'right' });

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${pageCount} | Caixinha Pro`, 105, 285, { align: 'center' });
    }

    doc.save(`Relatorio_Distribuicao_${competencia.replace(/ /g, '_')}.pdf`);
  },

  exportSimplifiedReportPDF: async ({ 
    unitName, 
    unitLogo, 
    competencia, 
    totalArrecadado, 
    setores, 
    valorPontoSalao, 
    valorPontoCozinha,
    totalSalao,
    totalCozinha
  }: SimplifiedReportParams) => {
    const doc = new jsPDF();
    const now = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });

    // Try to add Logo
    if (unitLogo) {
      const base64Logo = await getBase64ImageFromUrl(unitLogo);
      if (base64Logo) {
        try {
          doc.addImage(base64Logo, 'PNG', 14, 10, 30, 15, undefined, 'FAST');
        } catch (e) {
          console.warn('Failed to add image to PDF');
        }
      }
    }

    // Header
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text('Relatório Mensal de Gorjetas', 105, unitLogo ? 35 : 20, { align: 'center' });
    
    doc.setDrawColor(230);
    doc.line(14, unitLogo ? 42 : 28, 196, unitLogo ? 42 : 28);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    const startY = unitLogo ? 52 : 38;

    // Info Grid
    doc.setFont('helvetica', 'bold');
    doc.text('Unidade:', 14, startY);
    doc.setFont('helvetica', 'normal');
    doc.text(unitName, 50, startY);

    doc.setFont('helvetica', 'bold');
    doc.text('Competência:', 14, startY + 10);
    doc.setFont('helvetica', 'normal');
    doc.text(competencia, 50, startY + 10);

    doc.setFont('helvetica', 'bold');
    doc.text('Setores:', 14, startY + 20);
    doc.setFont('helvetica', 'normal');
    doc.text(setores, 50, startY + 20);

    doc.setFont('helvetica', 'bold');
    doc.text('Total Arrecadado:', 14, startY + 30);
    doc.setFont('helvetica', 'normal');
    doc.text(`R$ ${totalArrecadado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 50, startY + 30);

    doc.setFont('helvetica', 'bold');
    doc.text('Data de Geração:', 14, startY + 40);
    doc.setFont('helvetica', 'normal');
    doc.text(now, 50, startY + 40);

    // Results Section
    let resultsY = startY + 60;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Resumo por Setor', 14, resultsY);
    doc.setLineWidth(0.5);
    doc.line(14, resultsY + 2, 70, resultsY + 2);

    resultsY += 15;
    doc.setFontSize(12);

    if (totalSalao !== undefined || valorPontoSalao !== undefined) {
      doc.setFont('helvetica', 'bold');
      doc.text('SALAO', 14, resultsY);
      doc.setFont('helvetica', 'normal');
      if (totalSalao !== undefined) {
        doc.text(`Total considerado: R$ ${totalSalao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, resultsY + 8);
      }
      if (valorPontoSalao !== undefined) {
        doc.text(`Valor do Ponto: R$ ${valorPontoSalao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`, 14, totalSalao !== undefined ? resultsY + 16 : resultsY + 8);
      }
      resultsY += 30;
    }

    if (totalCozinha !== undefined || valorPontoCozinha !== undefined) {
      doc.setFont('helvetica', 'bold');
      doc.text('COZINHA', 14, resultsY);
      doc.setFont('helvetica', 'normal');
      if (totalCozinha !== undefined) {
        doc.text(`Total considerado: R$ ${totalCozinha.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, resultsY + 8);
      }
      if (valorPontoCozinha !== undefined) {
        doc.text(`Valor do Ponto: R$ ${valorPontoCozinha.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`, 14, totalCozinha !== undefined ? resultsY + 16 : resultsY + 8);
      }
    }

    // Footer
    const footerY = 270;
    doc.setDrawColor(240);
    doc.line(14, footerY - 5, 196, footerY - 5);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(120);
    const footerText = "Relatório simplificado para conferência dos funcionários. Os valores seguem os cálculos oficiais já realizados pelo sistema.";
    const splitFooter = doc.splitTextToSize(footerText, 180);
    doc.text(splitFooter, 105, footerY, { align: 'center' });

    doc.save(`Relatorio_Tips_Funcionario_${competencia.replace(/ /g, '_')}.pdf`);
  }
};
