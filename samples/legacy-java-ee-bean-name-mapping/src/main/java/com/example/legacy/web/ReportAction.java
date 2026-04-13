package com.example.legacy.web;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.web.servlet.ModelAndView;
import com.example.legacy.lib.ReportService;

public class ReportAction {
  ReportService reportService;

  public void setReportService(ReportService reportService) {
    this.reportService = reportService;
  }

  public ModelAndView list(HttpServletRequest request, HttpServletResponse response) {
    reportService.loadReportList();
    return new ModelAndView("report/list");
  }

  public ModelAndView exportExcel(HttpServletRequest request, HttpServletResponse response) {
    reportService.exportReportList();
    return new ModelAndView("redirect:/report/list.as");
  }
}
