package com.example.legacy.web;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import org.springframework.web.servlet.ModelAndView;

public class SampleAction {

  public ModelAndView getSampleList(HttpServletRequest request, HttpServletResponse response) {
    return new ModelAndView("/sample/list");
  }

  public ModelAndView getSampleView(HttpServletRequest request, HttpServletResponse response) {
    return new ModelAndView("/sample/view");
  }
}
